import { ArrowLeft, ArrowRight, BookmarkMinus } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { savedReferences } from "@/library/library";
import { unsaveComponent } from "../actions";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { pageNumber, paginate } from "@/library/pagination";

export const dynamic = "force-dynamic";
export default async function Saved({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const db = await getDb();
  const actor = await requirePerson(db);
  const rows = await savedReferences(db, actor.id);
  const results = paginate(rows, pageNumber((await searchParams).page));
  return <><div className="page-heading"><h1>Saved references</h1><a href="/library">Library</a></div>
    {!rows.length && <p>No references saved yet.</p>}
    <div className="result-list">{results.items.map((r) => <article className="library-result" key={r.id}>
      <div>{r.component ? <><h2>{r.component.text}</h2><p>{r.component.segment}</p><a href={`/c/${r.component.slug}?v=${r.component.version}`}>{r.component.title} · Revision {r.component.version}</a></> : <p>Source publication is no longer available.</p>}
        {r.note && <p>{r.note}</p>}<p><a href={`/ideas/${r.cardId}`}>Open my idea</a></p>
      </div><ActionForm action={unsaveComponent}><input type="hidden" name="id" value={r.id} /><SubmitButton iconOnly title="Remove reference"><BookmarkMinus size={18} /></SubmitButton></ActionForm>
    </article>)}</div>
    <nav className="pagination" aria-label="Saved reference pages">{results.page > 1 && <a href={`/library/saved?page=${results.page - 1}`}><ArrowLeft size={16} />Previous</a>}<span>{results.page} / {results.pages}</span>{results.page < results.pages && <a href={`/library/saved?page=${results.page + 1}`}>Next<ArrowRight size={16} /></a>}</nav>
  </>;
}
