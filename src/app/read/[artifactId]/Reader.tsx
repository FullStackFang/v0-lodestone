"use client";

/** The reading surface.
 *
 * The container renders one span per segment and nothing else — no inserted
 * character, no soft break, no decorative content — so concatenating its
 * text nodes is the canonical text code unit for code unit. That is the one
 * rule here that cannot bend: every offset the reader produces is measured
 * against it.
 *
 * The six keys are this file's business. They are the key handler the map's
 * grep test excludes; nothing else in the app decides what a tag means. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  offsetsFromRange,
  segments,
  type AnnotationSpan,
  type WalkNode,
  type WalkRange,
} from "@/harness/papers/offsets";
import { finishSession, removeHighlight, saveHighlight, type SavedHighlight } from "./actions";

interface TagKey {
  key: string;
  tag: string;
  label: string;
}

/** `i h c e s n` — the reader's whole vocabulary. */
const KEYS: TagKey[] = [
  { key: "i", tag: "intent", label: "intent" },
  { key: "h", tag: "how", label: "how" },
  { key: "c", tag: "constraint", label: "constraint" },
  { key: "e", tag: "eval", label: "eval" },
  { key: "s", tag: "insight", label: "insight" },
  { key: "n", tag: "note", label: "note" },
];

const SUBTYPES = ["product", "distribution", "revenue", "capability"] as const;

/** The facets an exhaustive reading can mark absent. */
const ABSENCE = [
  { facet: "purpose", label: "no purpose stated" },
  { facet: "mechanism", label: "no mechanism stated" },
  { facet: "constraint", label: "no constraint stated" },
  { facet: "evaluation", label: "no evaluation stated" },
];

export interface ReaderProps {
  artifactId: string;
  sessionId: string;
  mode: "casual" | "exhaustive";
  title: string;
  canonicalText: string;
  initial: SavedHighlight[];
}

interface Draft {
  start: number;
  end: number;
  selected: string;
  x: number;
  y: number;
  tag: string | null;
  subtype: string | null;
  note: string;
}

export function Reader(props: ReaderProps) {
  const [marks, setMarks] = useState<SavedHighlight[]>(props.initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [absent, setAbsent] = useState<string[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const noteInput = useRef<HTMLInputElement>(null);

  const onSelection = useCallback(() => {
    const node = container.current;
    if (!node) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const span = offsetsFromRange(node as unknown as WalkNode, range as unknown as WalkRange);
    if (!span) return;

    const rect = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    setError(null);
    setDraft({
      ...span,
      selected: props.canonicalText.slice(span.start, span.end),
      x: rect.left - box.left,
      y: rect.bottom - box.top + 6,
      tag: null,
      subtype: null,
      note: "",
    });
  }, [props.canonicalText]);

  useEffect(() => {
    if (draft?.tag === "note") noteInput.current?.focus();
  }, [draft?.tag]);

  const save = useCallback(
    async (current: Draft, tag: string) => {
      if (tag === "note" && current.note.trim().length === 0) {
        setError("A note needs words.");
        noteInput.current?.focus();
        return;
      }
      const result = await saveHighlight({
        sessionId: props.sessionId,
        start: current.start,
        end: current.end,
        selected: current.selected,
        tag,
        subtype: tag === "how" ? current.subtype : null,
        note: tag === "note" ? current.note.trim() : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMarks((rows) => [...rows, result.annotation]);
      setDraft(null);
      setError(null);
      window.getSelection()?.removeAllRanges();
    },
    [props.sessionId],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!draft) return;
      if (event.key === "Escape") {
        setDraft(null);
        setError(null);
        return;
      }
      const typing = document.activeElement === noteInput.current;
      if (typing) {
        if (event.key === "Enter") void save(draft, "note");
        return;
      }
      if (event.key === "Enter" && draft.tag) {
        void save(draft, draft.tag);
        return;
      }
      const chosen = KEYS.find((k) => k.key === event.key.toLowerCase());
      if (!chosen) return;
      event.preventDefault();
      // `how` discloses its optional subtype; `note` asks for words. Every
      // other tag is one keystroke and done.
      if (chosen.tag === "how" || chosen.tag === "note") {
        setDraft({ ...draft, tag: chosen.tag });
        return;
      }
      void save(draft, chosen.tag);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, save]);

  const spans: AnnotationSpan[] = marks.map((m) => ({ id: m.id, start: m.start, end: m.end, tag: m.tag }));
  const pieces = segments(props.canonicalText, spans);
  const byId = new Map(marks.map((m) => [m.id, m]));

  async function remove(id: string) {
    const result = await removeHighlight(id);
    if (!result.ok) {
      setError(result.error ?? "The delete did not complete.");
      return;
    }
    setMarks((rows) => rows.filter((row) => row.id !== id));
  }

  return (
    <>
      <div className="legend">
        {KEYS.map((k) => (
          <span key={k.tag}>
            <span className={`swatch seg tag-${k.tag}`} />
            {k.label} <kbd>{k.key}</kbd>
          </span>
        ))}
        <span>Esc dismisses.</span>
      </div>

      {props.mode === "exhaustive" && (
        <div className="absence">
          <strong style={{ fontWeight: 500 }}>Absent from this text:</strong>
          {ABSENCE.map((a) => (
            <label key={a.facet}>
              <input
                type="checkbox"
                checked={absent.includes(a.facet)}
                onChange={(e) =>
                  setAbsent((rows) =>
                    e.target.checked ? [...rows, a.facet] : rows.filter((r) => r !== a.facet),
                  )
                }
              />
              {a.label}
            </label>
          ))}
        </div>
      )}

      {error && <p className="notice err">{error}</p>}

      <div style={{ position: "relative" }}>
        <div className="reading" ref={container} onMouseUp={onSelection} onKeyUp={onSelection}>
          {pieces.map((piece) => {
            const covering = piece.covering.map((id) => byId.get(id)).filter(Boolean) as SavedHighlight[];
            const className = [
              "seg",
              ...covering.map((c) => `tag-${c.tag}`),
              covering.length > 1 ? "overlap" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <span
                key={piece.start}
                className={className}
                data-ids={covering.map((c) => c.id).join(" ") || undefined}
                onMouseEnter={covering.length > 0 ? () => setHovered(piece.start) : undefined}
                onMouseLeave={covering.length > 0 ? () => setHovered(null) : undefined}
              >
                {piece.text}
                {hovered === piece.start && covering.length > 0 && (
                  <span className="hovercard">
                    <dl>
                      {covering.map((c) => (
                        <div key={c.id}>
                          <dt className="t">
                            {c.tag}
                            {c.subtype ? ` · ${c.subtype}` : ""}
                          </dt>
                          <dd style={{ margin: "0 0 6px" }}>
                            {c.note ?? "—"}{" "}
                            <button
                              type="button"
                              onClick={() => void remove(c.id)}
                              style={{ font: "inherit", border: 0, background: "none", cursor: "pointer", textDecoration: "underline" }}
                            >
                              delete
                            </button>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {draft && (
          <div className="tagger" style={{ left: draft.x, top: draft.y }} role="dialog" aria-label="Tag this span">
            <span className="quote">{draft.selected.slice(0, 90)}</span>
            <div className="keys">
              {KEYS.map((k) => (
                <button
                  key={k.tag}
                  type="button"
                  aria-pressed={draft.tag === k.tag}
                  onClick={() =>
                    k.tag === "how" || k.tag === "note"
                      ? setDraft({ ...draft, tag: k.tag })
                      : void save(draft, k.tag)
                  }
                >
                  <kbd>{k.key}</kbd>
                  {k.label}
                </button>
              ))}
            </div>

            {draft.tag === "how" && (
              <div className="keys">
                {SUBTYPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={draft.subtype === s}
                    onClick={() => setDraft({ ...draft, subtype: draft.subtype === s ? null : s })}
                  >
                    {s}
                  </button>
                ))}
                <button type="button" onClick={() => void save(draft, "how")}>
                  save{draft.subtype ? ` as ${draft.subtype}` : " untyped"}
                </button>
              </div>
            )}

            {draft.tag === "note" && (
              <>
                <input
                  ref={noteInput}
                  type="text"
                  value={draft.note}
                  placeholder="What does this make you want to know?"
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
                <button type="button" onClick={() => void save(draft, "note")}>
                  save the note
                </button>
              </>
            )}

            {error && <span className="err">{error}</span>}
          </div>
        )}
      </div>

      {/* The server action is the form's action, so its redirect is the
          response: the reader lands on what the sitting produced. */}
      <form action={finishSession}>
        <input type="hidden" name="artifactId" value={props.artifactId} />
        <input type="hidden" name="sessionId" value={props.sessionId} />
        {absent.map((facet) => (
          <input key={facet} type="hidden" name="absent" value={facet} />
        ))}
        <button className="button" type="submit">
          End session
        </button>
      </form>
    </>
  );
}
