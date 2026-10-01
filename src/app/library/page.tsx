import { BookmarkPlus, Search, ArrowLeft, ArrowRight } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { listComponents, savedReferences } from "@/library/library";
import { ideasForOwner } from "@/review/revisions";
import { FACETS } from "@/harness/schema";
import { IndustryGroup } from "@/schema/card";
import { saveComponent } from "./actions";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { pageNumber } from "@/library/pagination";

export const dynamic = "force-dynamic";
export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = await getDb();
  const actor = await requirePerson(db);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const facet = FACETS.find((f) => f === params.facet);
  const industry = IndustryGroup.options.find((i) => i === params.industry);
  const [results, ideas, saved] = await Promise.all([listComponents(db, actor.id, { query, facet, industry, page: pageNumber(params.page) }), ideasForOwner(db, actor.id), savedReferences(db, actor.id)]);
  const pageLink = (p: number) => `/library?${new URLSearchParams({ q: query, facet: facet ?? "", industry: industry ?? "", page: String(p) })}`;
  return <>
    <div className="page-heading"><h1>Component library</h1><a href="/library/saved">Saved references ({saved.length})</a></div>
    <form className="filter-bar">
      <label>Search<input name="q" type="search" defaultValue={query} placeholder="Customer, problem or mechanism" maxLength={200} /></label>
      <label>Component<select name="facet" defaultValue={facet ?? ""}><option value="">All components</option>{FACETS.map((f) => <option key={f} value={f}>{f.replaceAll("_", " ").replaceAll(".", ": ")}</option>)}</select></label>
      <label>Industry<select name="industry" defaultValue={industry ?? ""}><option value="">All industries</option>{IndustryGroup.options.map((i) => <option key={i} value={i}>{i.replaceAll("_", " ")}</option>)}</select></label>
      <button className="button" title="Search library"><Search size={16} />Search</button>
    </form>
    <p className="muted">{results.total} published components</p>
    {!results.items.length && <p>No published components match these filters.</p>}
    <div className="result-list">{results.items.map((c) => <article className="library-result" key={`${c.revisionId}:${c.key}`}>
      <div><span className="eyebrow">{c.facet.replaceAll(".", ": ")}</span><h2>{c.text}</h2><p>{c.segment}</p>
        <a href={`/c/${c.slug}?v=${c.version}`}>{c.title} · Revision {c.version}</a>
        {c.evidenceType && <span className="evidence-label">{c.evidenceType.replaceAll("_", " ")}</span>}
      </div>
      {ideas.length ? <ActionForm action={saveComponent} className="save-reference">
        <input type="hidden" name="revisionId" value={c.revisionId} /><input type="hidden" name="component" value={c.key} />
        <label>Reference for<select name="cardId" required>{ideas.map(({ card }) => <option key={card.id} value={card.id}>{card.offering ?? "Untitled idea"}</option>)}</select></label>
        <SubmitButton secondary><BookmarkPlus size={16} />Save reference</SubmitButton>
        {saved.some((s) => s.revisionId === c.revisionId && s.component?.key === c.key) && <span className="saved-mark">Saved</span>}
      </ActionForm> : <a href="/new">Create an idea</a>}
    </article>)}</div>
    <nav className="pagination" aria-label="Library pages">{results.page > 1 && <a href={pageLink(results.page - 1)}><ArrowLeft size={16} />Previous</a>}<span>{results.page} / {results.pages}</span>{results.page < results.pages && <a href={pageLink(results.page + 1)}>Next<ArrowRight size={16} /></a>}</nav>
  </>;
}
