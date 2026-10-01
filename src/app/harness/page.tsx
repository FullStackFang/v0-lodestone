/** The artifact list — everything with a canonical text, papers and
 *  people's documents alike, with what has been read on it.
 *
 *  Mode is chosen here, on the link, and written to the session when it
 *  opens. Nothing later can change it: an exhaustive reading is a promise
 *  made at the start, never a fact inferred from how long the sitting was. */
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { GOLDEN_SET_TARGET, goldenSet, listArtifacts } from "@/harness/papers/reading";
import "./harness.css";

export const dynamic = "force-dynamic";

const FORMAT_LABELS: Record<string, string> = {
  abstract: "abstract",
  deck: "deck",
  resume: "resume",
  stage_event: "turn",
};

export default async function HarnessPage() {
  const db = await getDb();
  await requireCurator(db);
  const [rows, golden] = await Promise.all([listArtifacts(db), goldenSet(db)]);

  return (
    <>
      <div className="section">
        <span className="num">§ Harness · Reading</span>
        <h1>What there is to read.</h1>
      </div>

      <div className="tracker">
        <span className="n tabular">
          {golden.n} of {GOLDEN_SET_TARGET}
        </span>
        <span className="missing">
          golden set — artifacts with at least one exhaustive session that ended.
          {golden.missing.length > 0 && (
            <>
              {" "}
              Still without one: {golden.missing.map((m) => m.title).join(", ")}.
            </>
          )}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="notice">
          Nothing ingested yet. <code>npm run harness:ingest -- --list evals/harness/papers/seed.txt</code>
        </p>
      ) : (
        <div className="rows">
          {rows.map((row) => (
            <article className="row" key={row.textHash}>
              <div>
                <span className="who">
                  {FORMAT_LABELS[row.sourceFormat] ?? row.sourceFormat} · v{row.version}
                </span>
                <h2 style={{ margin: "2px 0 0", fontSize: 15 }}>{row.title}</h2>
                <p className="preview">{row.preview}…</p>
              </div>
              <div className="meta">
                <span className="tabular">
                  {row.annotationCount} annotation{row.annotationCount === 1 ? "" : "s"}
                </span>
                <span>{row.complete ? "complete" : "not complete"}</span>
                <a href={`/read/${row.artifactId}?mode=casual`}>Read</a>
                <a href={`/read/${row.artifactId}?mode=exhaustive`}>Read exhaustively</a>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="notice">
        <a href="/annotations">Every annotation</a> · <a href="/reconcile">Reconciliation queue</a>
      </p>
    </>
  );
}
