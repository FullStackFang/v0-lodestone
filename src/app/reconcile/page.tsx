/** Where the reader and the extractor disagreed, and where the model was
 *  silent. Conflicts wait for a person; misses are a record, not a task. */
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { reconciliationQueue } from "@/harness/papers/reconcile";
import { resolve } from "./actions";
import "../harness/harness.css";

export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const db = await getDb();
  await requireCurator(db);
  const rows = await reconciliationQueue(db);
  const conflicts = rows.filter((r) => r.relation === "conflict");
  const misses = rows.filter((r) => r.relation === "miss");

  return (
    <>
      <div className="section">
        <span className="num">§ Harness · Reconciliation</span>
        <h1>Where the two readings differ.</h1>
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <span className="num">01</span>
        <h2>Conflicts ({conflicts.length})</h2>
      </div>
      {conflicts.length === 0 ? (
        <p className="notice">Nothing waiting.</p>
      ) : (
        <div className="rows">
          {conflicts.map((row) => (
            <article className="row" key={row.id}>
              <div>
                <span className="who">
                  {row.humanFacet ?? "unfiled"} vs {row.modelFacet ?? "—"} · overlap{" "}
                  {row.overlap === null ? "—" : row.overlap.toFixed(2)}
                </span>
                <p className="preview" style={{ fontStyle: "italic" }}>
                  “{row.humanQuote}”
                </p>
                <p className="preview" style={{ color: "var(--taupe)" }}>
                  model: {row.modelText ?? "—"}{" "}
                  {row.modelSpan ? `[${row.modelSpan[0]}, ${row.modelSpan[1]})` : ""} ·{" "}
                  <a href={`/read/${row.artifactId}`}>open the text</a>
                </p>
              </div>
              <div className="meta">
                <form action={resolve}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="button outline" name="keep" value="human" type="submit">
                    mine stands
                  </button>{" "}
                  <button className="button outline" name="keep" value="model" type="submit">
                    the model&apos;s stands
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="section" style={{ marginTop: 28 }}>
        <span className="num">02</span>
        <h2>Misses ({misses.length})</h2>
      </div>
      <p className="notice">What the reader found and the extractor did not. Nothing to resolve.</p>
      <div className="rows">
        {misses.map((row) => (
          <article className="row" key={row.id}>
            <div>
              <span className="who">{row.humanFacet ?? "unfiled"}</span>
              <p className="preview" style={{ fontStyle: "italic" }}>
                “{row.humanQuote}”
              </p>
            </div>
            <div className="meta">
              <a href={`/read/${row.artifactId}`}>the text</a>
            </div>
          </article>
        ))}
      </div>

      <p className="notice">
        <a href="/harness">Back to the list</a>
      </p>
    </>
  );
}
