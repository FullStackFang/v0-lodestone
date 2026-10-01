import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { digestFor, weekAgo } from "@/lodestone/digest";
import "../lodestone.css";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function DigestPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const now = new Date();
  const digest = await digestFor(db, person.id, weekAgo(now), now);
  return <article className="ls-digest">
    <header className="ls-header">
      <div>
        <p className="eyebrow">Lodestone · weekly digest</p>
        <h1>Week of {day(digest.since)} to {day(digest.until)}</h1>
        <p>{digest.newCards} card{digest.newCards === 1 ? "" : "s"} published to the cohort this week. Every row is a stored record and the block it matched on; nothing here was written by a model.</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav>
    </header>

    {digest.sections.length === 0 ? <div className="ls-quiet"><p>You have no cards, so nothing bears on them yet.</p><span>Import a Forge export to start.</span></div> : digest.sections.map((s) => <section className="ls-section" key={s.ideaId}>
      <h2><Link href={`/lodestone/cards/${s.ideaId}`}>{s.title}</Link></h2>
      {s.peers.length === 0 && s.papers.length === 0 ? <div className="ls-quiet"><p>Nothing new bears on this card.</p></div> : <div>
        {s.peers.map((p) => <div className="ls-drow" key={p.ideaId}>
          <span className="k">new card</span>
          <div><div className="t"><Link href={`/lodestone/cards/${p.ideaId}`}>{p.title}</Link></div><div className="why">{p.owner.name} published {p.publishedAt ? day(p.publishedAt) : ""} · {p.shared.length ? <>shares <b>{p.shared.map((b) => b.mine).join(", ")}</b> with your card</> : "no block within reach"}</div></div>
          <span className="ct">{p.score.toFixed(2)}</span>
        </div>)}
        {s.papers.map((p) => <div className="ls-drow" key={p.documentId}>
          <span className="k">corpus</span>
          <div><div className="t">{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</div><div className="why">added {day(p.addedAt)} · closest to <b>{p.blocks.join(", ")}</b>{p.year ? ` · ${p.year}` : ""}</div></div>
          <span className="ct">{p.score.toFixed(2)}</span>
        </div>)}
      </div>}
    </section>)}
  </article>;
}
