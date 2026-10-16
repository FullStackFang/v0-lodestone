import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { cohortMap, corpusSummary } from "@/lodestone/map";
import { isPilotOperatorEmail, membershipFor } from "@/pilot/membership";
import { Chip, Pill, SectionHead } from "../ui";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function MapPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const membership = await membershipFor(db, person.id);
  const director = isPilotOperatorEmail(person.email) || membership?.memberKind === "operator";
  if (!director) {
    return <div className="wrap stack">
      <section className="panel paper split">
        <div className="sec">
          <Link className="back dark" href="/lodestone"><ArrowLeft size={14} />Your cards</Link>
          <h1 className="h1 mast" style={{ color: "var(--ink)" }}>Directors only</h1>
        </div>
        <div className="sec">
          <p className="lede" style={{ maxWidth: "52ch" }}>The map is the program&apos;s view. It counts and names regions; it never opens a private card. Ask an operator for the operator role to see it.</p>
          <Pill href="/lodestone" variant="line" arrow="left" className="self-start">Back to your cards</Pill>
        </div>
      </section>
    </div>;
  }
  const now = new Date();
  const [map, corpus] = await Promise.all([cohortMap(db), corpusSummary(db)]);
  const biggest = Math.max(1, ...map.regions.map((r) => r.cards.length));
  const tallest = Math.max(1, ...map.profile.rows.map((r) => r.count));
  const above = map.profile.rows.filter((r) => r.close).reduce((n, r) => n + r.count, 0);

  return <div className="wrap stack">
    <header className="mast drench">
      <div className="mast-grid">
        <div className="mast-copy">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Chip tone="glass">Operators only</Chip><span className="lab">Cohort map · as of {day(now)}</span></div>
          <h1 className="h1 wide">One cohort, as its published cards make it.</h1>
          <p className="line">Regions are clusters of published cards, named from the cards&apos; own words. Counts, never grades. No card its author kept private appears here.</p>
        </div>
        <div className="cannot">
          <span className="lab">What this page cannot do</span>
          <span className="r">Open a private card<span className="dots" /><span className="never">never</span></span>
          <span className="r">Read a thread<span className="dots" /><span className="never">never</span></span>
          <span className="r">Show a grade or rank a member<span className="dots" /><span className="never">never</span></span>
        </div>
      </div>
    </header>

    <section className="figs">
      <div className="fig"><b>{map.counts.members}</b><span>active members</span></div>
      <div className="fig"><b>{map.counts.working}</b><span>working an idea</span></div>
      <div className="fig"><b className="accent">{map.counts.published}</b><span>cards published to the cohort</span></div>
      <div className="fig"><b>{map.regions.length}</b><span>regions the cards form</span></div>
      <div className="fig"><b>{map.papersTouched}</b><span>papers within {map.close.toFixed(2)} of a card</span></div>
    </section>

    <section className="panel plum split">
      <SectionHead n="01" title="Regions" tone="var(--pink)">
        <p className="lede" style={{ maxWidth: "30ch" }}>{map.counts.unplaced ? `${plural(map.counts.unplaced, "published card")} ${map.counts.unplaced === 1 ? "has" : "have"} no vectors and cannot be placed.` : "Every published card is placed."} A region is named by the words its cards share, not by a model&apos;s summary.</p>
        <p className="note" style={{ maxWidth: "30ch" }}>Bars are card counts against the largest region.</p>
      </SectionHead>
      <div>
        {map.regions.length ? <>
          {map.regions.map((r, i) => <div className={i === map.regions.length - 1 ? "reg last" : "reg"} key={r.label}>
            <span className="n">{i + 1}</span>
            <span className="t">{r.label}<small>{r.cards.map((c, j) => <span key={c.ideaId}>{j ? " · " : ""}<Link href={`/lodestone/cards/${c.ideaId}`}>{c.title}</Link> ({c.owner})</span>)}</small></span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round((r.cards.length / biggest) * 100)}%` }} /></span>
            <span className="c">{r.cards.length}<small>{r.cards.length === 1 ? "card" : "cards"}</small></span>
          </div>)}
          <div className="reg-foot"><span>{map.regions.map((r, i) => `Region ${i + 1} touched ${plural(r.papersTouched, "paper")}`).join("; ")} in the corpus.</span></div>
        </> : <div className="empty"><p>No published cards yet.</p><span>The map appears as members publish.</span></div>}
      </div>
    </section>

    <section className="two">
      <div className="panel teal-tint compact">
        <SectionHead n="02" title="How close the cards sit" tone="var(--teal)" size="small">
          <p className="lede" style={{ maxWidth: "52ch", fontSize: 15 }}>Every pair of published cards, binned by cosine. Solid bars are within {map.close.toFixed(2)}, the neighbour line. {plural(map.profile.pairs, "pair")}.</p>
        </SectionHead>
        <div className="hist" aria-label="Pairs of cards by cosine bin" style={{ marginTop: 20 }}>
          {[...map.profile.rows].reverse().map((r) => <div className={r.close ? "col close" : "col"} key={r.from ?? "below"}>
            <b>{r.count}</b>
            <i style={{ height: `${Math.max(3, Math.round((r.count / tallest) * 100))}%` }} />
            <span>{r.from === null ? "below" : r.from === 0.85 ? "0.85+" : r.from.toFixed(2)}</span>
          </div>)}
        </div>
        <p className="note" style={{ marginTop: 18, maxWidth: "none" }}>{above ? `${plural(above, "pair sits", "pairs sit")} above the line.` : "No pair sits above the line yet."}</p>
      </div>
      <div className="panel paper compact">
        <SectionHead n="03" title="The corpus" tone="var(--meta)" size="small">
          <p className="lede" style={{ fontSize: 15, maxWidth: "none" }}>{plural(corpus.bySource.paper, "paper")} and {plural(corpus.bySource.patent, "patent")}{corpus.newest ? `, the newest added ${day(corpus.newest)}` : ""}. Grown by <code>npm run lodestone:ingest</code>, which names a query set.</p>
        </SectionHead>
        <div style={{ marginTop: 20 }}>
          {corpus.querySets.length ? corpus.querySets.map((s, i) => <div className={i === corpus.querySets.length - 1 ? "set last" : "set"} key={`${s.kind}:${s.name}`}>
            <span className="t">{s.name}</span>
            <span className="c">{s.count}</span>
            <span className="k">{s.kind === "patent" ? "patents" : "papers"}</span>
          </div>) : <div className="empty"><p>No query sets yet.</p><span>Seeded abstracts carry none; each ingest run names one with <code>--set</code>.</span></div>}
        </div>
      </div>
    </section>
  </div>;
}
