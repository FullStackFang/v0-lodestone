import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { curatedResources } from "@/db/resource-schema";
import { requirePerson } from "@/lib/session";
import "../resources.css";

export const dynamic = "force-dynamic";
export default async function ResourceCatalogPage() {
  const db = await getDb();
  await requirePerson(db);
  const rows = await db.select().from(curatedResources).orderBy(desc(curatedResources.createdAt)).limit(1000);
  return <div className="resource-workspace"><a href="/resources">Resource Watch</a><h1>Research Corpus</h1>
    {rows.length === 0 && <p>No curated resources yet.</p>}
    {rows.map((resource) => <article id={resource.id} key={resource.id} className="resource-catalog-row">
      <span>{resource.kind.replaceAll("_", " ")}</span><h2>{resource.title}</h2>
      <p><a href={resource.sourceUrl} target="_blank" rel="noreferrer">{resource.identifier}</a> | {resource.sourceDate}</p>
      <dl>{resource.claims.map((claim, index) => <div key={index}><dt>{claim.facet}</dt><dd><blockquote>{claim.quote}</blockquote></dd></div>)}</dl>
      {resource.proposals.length > 0 && <div><h3>Hypotheses, not source claims</h3><ul>{resource.proposals.map((proposal, index) => <li key={index}>{proposal}</li>)}</ul></div>}
      <details><summary>Source text</summary><pre className="resource-source">{resource.rawText}</pre></details>
    </article>)}
  </div>;
}
