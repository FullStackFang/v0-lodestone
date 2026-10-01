import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { cohortMap } from "@/lodestone/map";
import { isPilotOperatorEmail, membershipFor } from "@/pilot/membership";
import "../lodestone.css";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const membership = await membershipFor(db, person.id);
  const director = isPilotOperatorEmail(person.email) || membership?.memberKind === "operator";
  if (!director) {
    return <article>
      <header className="ls-header"><div><p className="eyebrow">Lodestone · cohort map</p><h1>Directors only</h1><p>The map is the program's view. It counts and names regions; it never opens a private card. Ask an operator for the operator role to see it.</p></div><nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav></header>
    </article>;
  }
  const map = await cohortMap(db);
  const biggest = Math.max(1, ...map.regions.map((r) => r.cards.length));
  const tallest = Math.max(1, ...map.profile.rows.map((r) => r.count));
  return <article>
    <header className="ls-header">
      <div>
        <p className="eyebrow">Lodestone · cohort map</p>
        <h1>One cohort, as its published cards make it</h1>
        <p>Regions are clusters of published cards named from the cards' own words. Counts, never grades. No card its author kept private appears here.</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav>
    </header>

    <div className="ls-figs">
      <div className="ls-fig"><b>{map.counts.members}</b><span>active members</span></div>
      <div className="ls-fig"><b>{map.counts.working}</b><span>working an idea</span></div>
      <div className="ls-fig"><b className="accent">{map.counts.published}</b><span>cards published to the cohort</span></div>
      <div className="ls-fig"><b>{map.regions.length}</b><span>regions the cards form</span></div>
      <div className="ls-fig"><b>{map.papersTouched}</b><span>papers within {map.close.toFixed(2)} of a card</span></div>
    </div>

    <div className="ls-two" style={{ marginTop: 0 }}>
      <section className="ls-section">
        <h2>Regions</h2>
        <p>{map.counts.unplaced ? `${map.counts.unplaced} published card${map.counts.unplaced === 1 ? " has" : "s have"} no vectors and cannot be placed.` : "Every published card is placed."}</p>
        {map.regions.length ? <div className="ls-rows">{map.regions.map((r) => <div className="ls-region" key={r.label}>
          <span className="nm">{r.label}</span>
          <span className="ct">{r.cards.length} card{r.cards.length === 1 ? "" : "s"}</span>
          <span className="bar"><i style={{ width: `${Math.round((r.cards.length / biggest) * 100)}%` }} /></span>
          <span className="who">{r.cards.map((c, i) => <span key={c.ideaId}>{i ? ", " : ""}<Link href={`/lodestone/cards/${c.ideaId}`}>{c.title}</Link> ({c.owner})</span>)}</span>
          <span className="ip">touched {r.papersTouched} paper{r.papersTouched === 1 ? "" : "s"} in the corpus</span>
        </div>)}</div> : <div className="ls-quiet"><p>No published cards yet.</p><span>The map appears as members publish.</span></div>}
      </section>

      <section className="ls-section">
        <h2>How close the cards sit to each other</h2>
        <p>Every pair of published cards, binned by cosine. Solid bands are within {map.close.toFixed(2)}, the neighbour threshold. {map.profile.pairs} pairs.</p>
        <div className="ls-profile">
          {map.profile.rows.map((r) => <div className={`ls-prow${r.close ? " close" : ""}`} key={r.from ?? "below"}>
            <span className="lab">{r.from === null ? "below" : r.from === 0.85 ? "0.85+" : r.from.toFixed(2)}</span>
            <span className="track"><i style={{ width: `${Math.round((r.count / tallest) * 100)}%` }} /></span>
            <span>{r.count}</span>
          </div>)}
        </div>
      </section>
    </div>
    <p className="ls-note">What this page cannot do: open a private card, read a thread, show a grade, or rank members.</p>
  </article>;
}
