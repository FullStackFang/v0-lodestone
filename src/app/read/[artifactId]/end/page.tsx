/** What the sitting produced.
 *
 * Findings before asks: the reconciliation summary is what happened to the
 * reader's marks, then the papers their questions pulled, then prior art.
 * No congratulation, and no score on a card. */
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { sessionSummary } from "@/harness/papers/cards";
import { hasJudgments } from "@/harness/papers/followups";
import { judgeCard } from "../card-actions";
import "../../../harness/harness.css";

export const dynamic = "force-dynamic";

export default async function SessionEndPage({
  params,
  searchParams,
}: {
  params: Promise<{ artifactId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { artifactId } = await params;
  const query = await searchParams;
  const sessionId = Array.isArray(query.session) ? query.session[0] : query.session;
  if (!sessionId) notFound();

  const db = await getDb();
  await requireCurator(db);
  const summary = await sessionSummary(db, sessionId);
  if (!summary) notFound();

  const tuned = await hasJudgments(db, "paper_analogy");
  const nothing = summary.analogies.length === 0 && summary.priorArt.length === 0;

  return (
    <>
      <div className="section">
        <span className="num">§ Harness · Session ended</span>
        <h1>What that reading filed.</h1>
      </div>

      <div className="rows">
        <article className="row">
          <div>
            <span className="who">Reconciliation · {summary.mode}</span>
            <p className="preview">
              {summary.counts.match} matched the extractor, {summary.counts.boundary} agreed on the claim
              and differed on the span, {summary.counts.conflict} conflicted,{" "}
              {summary.counts.miss} were the extractor&apos;s misses.
            </p>
          </div>
          <div className="meta">
            {summary.counts.conflict > 0 && <a href="/reconcile">resolve the conflicts</a>}
          </div>
        </article>
      </div>

      {!tuned && !nothing && (
        <p className="notice">
          Ordering untuned — no paper_analogy judgment has been recorded yet, so treat the order as
          arbitrary and the set as the claim.
        </p>
      )}

      <div className="section" style={{ marginTop: 28 }}>
        <span className="num">01</span>
        <h2>From somewhere else</h2>
      </div>
      {summary.analogies.length === 0 ? (
        <p className="notice">
          No questions and no constraints on the record yet — a note that turns out to be a question is
          what pulls a paper here.
        </p>
      ) : (
        <div className="rows">
          {summary.analogies.map((row) => (
            <article className="row" key={row.matchResultId}>
              <div>
                <span className="who">
                  {row.card?.verdict ?? "no card"} · {row.source === "constraint" ? "from a constraint" : "from a question"}
                </span>
                {row.card ? (
                  <>
                    <p className="preview" style={{ fontSize: 15 }}>
                      {row.card.mapping}
                    </p>
                    <p className="preview">{row.card.why}</p>
                  </>
                ) : (
                  <p className="preview">The rerank did not complete for this one.</p>
                )}
                {row.paper.insight && (
                  <p className="preview" style={{ fontStyle: "italic" }}>
                    {row.paper.insight}
                  </p>
                )}
                <p className="preview" style={{ color: "var(--taupe)" }}>
                  {row.paper.citation}
                </p>
              </div>
              <div className="meta">
                <form action={judgeCard}>
                  <input type="hidden" name="matchResultId" value={row.matchResultId} />
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="url" value={row.paper.url ?? ""} />
                  <button className="button outline" name="verdict" value="requested" type="submit">
                    open / save
                  </button>{" "}
                  <button className="button outline" name="verdict" value="dismissed" type="submit">
                    dismiss
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="section" style={{ marginTop: 28 }}>
        <span className="num">02</span>
        <h2>Papers that did this</h2>
      </div>
      <p className="notice">Same field, same problem — the competition slide, not the inspiration board.</p>
      {summary.priorArt.length === 0 ? (
        <p className="notice">Nothing in the same field yet.</p>
      ) : (
        <div className="rows">
          {summary.priorArt.map((row) => (
            <article className="row" key={row.matchResultId}>
              <div>
                <span className="who">{row.paper.field ?? "field unknown"}</span>
                <p className="preview" style={{ fontSize: 15 }}>
                  {row.paper.purposes[0] ?? row.paper.title}
                </p>
                {row.paper.mechanisms.length > 0 && (
                  <p className="preview">{row.paper.mechanisms.join(" · ")}</p>
                )}
                <p className="preview" style={{ color: "var(--taupe)" }}>
                  {row.paper.citation}
                </p>
              </div>
              <div className="meta">
                <form action={judgeCard}>
                  <input type="hidden" name="matchResultId" value={row.matchResultId} />
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="url" value={row.paper.url ?? ""} />
                  <button className="button outline" name="verdict" value="requested" type="submit">
                    open / save
                  </button>{" "}
                  <button className="button outline" name="verdict" value="dismissed" type="submit">
                    dismiss
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="notice">
        <a href={`/read/${artifactId}`}>Read it again</a> · <a href="/harness">The list</a>
      </p>
    </>
  );
}
