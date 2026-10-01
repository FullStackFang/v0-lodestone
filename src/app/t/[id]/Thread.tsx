"use client";

/** The thread. Everything about where the card stands comes from the
 *  server's response — the rail never advances on its own, and there is no
 *  spinner: an in-flight turn is a line of amber text naming the work. */
import { useEffect, useRef, useState } from "react";
import type { GateVerdict } from "@/engine/gates";
import { STAGES, type CardStatus, type Stage } from "@/engine/stages";
import { OPENING_LINE, STAGE_LABELS, statusLine } from "@/engine/thread";

export interface ThreadTurn {
  id: string;
  input: string;
  reply: string;
  stage: Stage;
  gateResult: "pass" | "fail";
  failReason: string | null;
  fallbackUsed: boolean;
}

interface TurnResponse {
  reply: string;
  stage: Stage;
  status: CardStatus;
  questionsLeft: number;
  verdicts: Record<Stage, GateVerdict>;
  event: { stage: Stage; gateResult: "pass" | "fail"; failReason: string | null; fallbackUsed: boolean };
  workspaceUrl: string;
  shareUrl: string | null;
}

export function Thread(props: {
  cardId: string;
  slug: string;
  initialTurns: ThreadTurn[];
  initialStage: Stage;
  initialStatus: CardStatus;
  initialVerdicts: Record<Stage, GateVerdict>;
  initialQuestionsLeft: number | null;
  pendingInput: string | null;
  door: string;
}) {
  const [turns, setTurns] = useState(props.initialTurns);
  const [stage, setStage] = useState(props.initialStage);
  const [status, setStatus] = useState(props.initialStatus);
  const [verdicts, setVerdicts] = useState(props.initialVerdicts);
  const [questionsLeft, setQuestionsLeft] = useState(props.initialQuestionsLeft);
  const [draft, setDraft] = useState("");
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function send(input: string) {
    setInFlight(input);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${props.cardId}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) {
        setError(res.status === 403 ? "This thread belongs to another session." : `The turn did not complete (${res.status}).`);
        return;
      }
      const r = (await res.json()) as TurnResponse;
      setTurns((t) => [...t, { id: `${Date.now()}`, input, reply: r.reply, ...r.event }]);
      setStage(r.stage);
      setStatus(r.status);
      setVerdicts(r.verdicts);
      setQuestionsLeft(r.questionsLeft);
      setDraft("");
    } catch {
      setError("The turn did not complete.");
    } finally {
      setInFlight(null);
    }
  }

  // Door material: post it once, as the founder's first message.
  useEffect(() => {
    if (props.pendingInput && turns.length === 0 && !started.current) {
      started.current = true;
      void send(props.pendingInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const complete = status === "complete";
  const workspaceUrl = `/ideas/${props.cardId}`;
  const publishUrl = `${workspaceUrl}/publish`;
  const openingShown = turns.length === 0 && !props.pendingInput;

  return (
    <div className="workspace">
      <aside className="rail">
        <p style={{ margin: "0 0 18px" }}><a href={workspaceUrl}>Edit draft</a></p>
        <span className="eyebrow">Gates</span>
        <ol>
          {STAGES.map((s, i) => {
            const cls = s === stage && !complete ? "current" : verdicts[s]?.pass ? "passed" : "";
            return (
              <li key={s} className={cls}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <span>{STAGE_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>
        <div className="foot">
          {complete ? (
            <a href={publishUrl}>Preview and publish</a>
          ) : (
            <span>{verdicts[stage]?.reason || "Waiting on your words."}</span>
          )}
        </div>
      </aside>

      <section>
        <div className="thread">
          {openingShown && (
            <Turn who="Forge" forge text={OPENING_LINE} />
          )}
          {turns.map((t) => (
            <div key={t.id}>
              <Turn who="You" text={t.input} />
              <Turn who="Forge" forge text={t.reply} meta={t} />
            </div>
          ))}
          {inFlight && (
            <div>
              <Turn who="You" text={inFlight} />
              <div className="turn forge">
                <span className="who">Forge</span>
                <span className="text inflight">Reading the card and drafting.</span>
              </div>
            </div>
          )}
        </div>

        {complete && (
          <div className="ready">
            <span className="eyebrow">Draft ready</span>
            <div><a href={publishUrl}>Preview and publish</a></div>
          </div>
        )}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (v && !inFlight) void send(v);
          }}
        >
          <div className="status">{inFlight ? "Card · drafting" : statusLine(questionsLeft, complete)}</div>
          <textarea
            rows={4}
            value={draft}
            disabled={inFlight !== null}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
            }}
            placeholder={complete ? "Bring news — a pivot, an interview, a killed assumption." : "Answer, correct, or add. ⌘/Ctrl + Enter to send."}
          />
          <div className="row">
            <span style={{ fontSize: 11.5, color: error ? "var(--oxblood)" : "var(--taupe)" }}>
              {error ?? (props.door !== "chat" ? `Started from a ${props.door}.` : "")}
            </span>
            <button className="button" type="submit" disabled={inFlight !== null || !draft.trim()}>
              Send
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Turn(props: { who: string; text: string; forge?: boolean; meta?: ThreadTurn }) {
  const m = props.meta;
  return (
    <div className={`turn${props.forge ? " forge" : ""}`}>
      <span className="who">{props.who}</span>
      <div>
        <div className="text">{props.text}</div>
        {m && (
          <div className="meta">
            {STAGE_LABELS[m.stage]} gate{" "}
            {m.gateResult === "pass" ? (
              <span className="pass">passed</span>
            ) : (
              <span className="fail">open — {m.fallbackUsed ? "the model did not answer in form; asking directly" : m.failReason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
