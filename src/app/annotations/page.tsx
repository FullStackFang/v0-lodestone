/** Every annotation, newest first.
 *
 * Delete is offered on every row and refused by the ledger where a
 * reconciliation cites it — the rule lives in `deleteAnnotation`, not in
 * this page's idea of what is safe. */
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { annotatedTags, listAnnotations, listArtifacts } from "@/harness/papers/reading";
import { removeAnnotation } from "./actions";
import "../harness/harness.css";

export const dynamic = "force-dynamic";

export default async function AnnotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const one = (key: string) => {
    const value = Array.isArray(query[key]) ? query[key][0] : query[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };

  const db = await getDb();
  await requireCurator(db);
  const tag = one("tag");
  const artifactId = one("artifact");
  const [rows, tags, artifacts] = await Promise.all([
    listAnnotations(db, { tag, artifactId }),
    annotatedTags(db),
    listArtifacts(db),
  ]);

  const titles = new Map(artifacts.map((a) => [a.artifactId, a.title]));

  return (
    <>
      <div className="section">
        <span className="num">§ Harness · Annotations</span>
        <h1>What has been marked.</h1>
      </div>

      <form className="absence" method="get">
        <label>
          tag{" "}
          <select name="tag" defaultValue={tag ?? ""}>
            <option value="">any</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          artifact{" "}
          <select name="artifact" defaultValue={artifactId ?? ""}>
            <option value="">any</option>
            {[...titles].map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button className="button outline" type="submit">
          filter
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="notice">Nothing marked yet.</p>
      ) : (
        <div className="rows">
          {rows.map((row) => (
            <article className="row" key={row.id}>
              <div>
                <span className="who">
                  {row.tag}
                  {row.mechanismSubtype ? ` · ${row.mechanismSubtype}` : ""} · {row.mode}
                  {row.noteKind ? ` · ${row.noteKind}` : ""}
                </span>
                <p className="preview" style={{ fontStyle: "italic" }}>
                  “{row.quote}”
                </p>
                {row.note && <p className="preview">{row.note}</p>}
                <p className="preview" style={{ color: "var(--taupe)" }}>
                  <a href={`/read/${row.artifactId}`}>{row.title}</a> · [{row.startOff}, {row.endOff})
                  {row.assertionId ? " · filed" : " · unfiled"}
                </p>
              </div>
              <div className="meta">
                <form action={removeAnnotation}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="button outline" type="submit">
                    delete
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="notice">
        <a href="/harness">Back to the list</a>
      </p>
    </>
  );
}
