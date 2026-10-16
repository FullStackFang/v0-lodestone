import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { digestFor, weekAgo } from "@/lodestone/digest";
import { Chip, Pill } from "../ui";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function DigestPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const now = new Date();
  const digest = await digestFor(db, person.id, weekAgo(now), now);
  return <div className="wrap stack">
    <header className="mast drench">
      <Link className="back" href="/lodestone"><ArrowLeft size={14} />Your cards</Link>
      <div className="mast-copy">
        <span className="lab">Weekly digest</span>
        <h1 className="h1 title">Week of {day(digest.since)} to {day(digest.until)}</h1>
        <p className="line">{plural(digest.newCards, "card")} published to the cohort this week. Every row is a stored record and the block it matched on; <b>nothing here was written by a model</b>.</p>
      </div>
    </header>

    {digest.sections.length === 0 ? <section className="panel paper split">
      <div className="empty"><p>You have no cards, so nothing bears on them yet.</p><span>Import a Forge export to start.</span></div>
      <Pill href="/lodestone#import" variant="ink" arrow="right" className="self-start">Import a Forge export</Pill>
    </section> : digest.sections.map((s, i) => <section className="panel paper split" key={s.ideaId}>
      <div className="sec">
        <span className="lab" style={{ color: "var(--meta)" }}>{String(i + 1).padStart(2, "0")} · your card</span>
        <h2 className="serif" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0, fontWeight: 500, overflowWrap: "anywhere" }}><Link href={`/lodestone/cards/${s.ideaId}`} style={{ textDecoration: "none" }}>{s.title}</Link></h2>
        <Pill href={`/lodestone/cards/${s.ideaId}/field`} variant="line" arrow="right" small className="self-start">See the field</Pill>
      </div>
      <div>
        {s.peers.length === 0 && s.papers.length === 0 ? <div className="empty"><p>Nothing new bears on this card.</p><span>The corpus grows nightly; the cohort publishes when it is ready.</span></div> : <>
          {s.peers.map((p) => <div className="drow" key={p.ideaId}>
            <Chip tone="lime">New card</Chip>
            <div><div className="t"><Link href={`/lodestone/cards/${p.ideaId}`}>{p.title}</Link></div><div className="why">{p.owner.name} published{p.publishedAt ? ` ${day(p.publishedAt)}` : ""} · {p.shared.length ? <>shares <b>{p.shared.map((b) => b.mine.toLowerCase()).join(", ")}</b> with your card</> : "nearest to your card, below the line"}</div></div>
            <span className="s">{p.score.toFixed(2)}</span>
          </div>)}
          {s.papers.map((p) => <div className="drow" key={p.documentId}>
            <Chip tone="ghost">{p.kind === "patent" ? "Patent" : "Corpus"}</Chip>
            <div><div className="t">{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</div><div className="why">added {day(p.addedAt)} · closest to <b>{p.blocks.join(", ").toLowerCase()}</b>{p.year ? ` · ${p.year}` : ""}{p.venue ? ` · ${p.venue}` : ""}</div></div>
            <span className="s">{p.score.toFixed(2)}</span>
          </div>)}
        </>}
      </div>
    </section>)}
  </div>;
}
