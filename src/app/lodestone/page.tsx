import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { cardBlocks, cardsForOwner, cohortCards, cohortCounts } from "@/lodestone/cards";
import { corpusSize } from "@/lodestone/priorArt";
import { isActiveMember } from "@/pilot/membership";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { importForgeCard } from "./actions";
import "./lodestone.css";

export const dynamic = "force-dynamic";

export default async function LodestonePage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const [cards, member, counts, corpus] = await Promise.all([
    cardsForOwner(db, person.id),
    isActiveMember(db, person.id),
    cohortCounts(db),
    corpusSize(db),
  ]);
  // The cohort's published cards, for members only: nine blocks and an
  // owner name, the same rule the card page enforces.
  const cohort = member ? (await cohortCards(db)).filter((c) => c.owner.id !== person.id) : [];
  return <>
    <header className="ls-header">
      <div>
        <p className="eyebrow">Lodestone · your cards</p>
        <h1>{person.name}</h1>
        <p>{member ? `An active member of this cohort. ${counts.published} of ${counts.members} members have published a card; the corpus holds ${corpus} paper${corpus === 1 ? "" : "s"}.` : "Not yet a member of this cohort. Your cards stay private and still match against the corpus; publishing needs an invitation."}</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone/digest">This week's digest <ArrowRight size={13} /></Link><Link href="/lodestone/map">Cohort map <ArrowRight size={13} /></Link></nav>
    </header>

    {cards.length ? <ul className="ls-list">{cards.map((card) => {
      const { confirmed } = cardBlocks(card.doc);
      return <li key={card.ideaId}>
        <h2><Link href={`/lodestone/cards/${card.ideaId}`}>{card.title}</Link></h2>
        <span className={`ls-state ${card.visibility}`}>{card.visibility === "cohort" ? "cohort" : "private"}</span>
        {card.line ? <p>{card.line}</p> : null}
        <span className="meta">{confirmed} of 9 blocks in your own words · updated {card.updatedAt.toLocaleDateString("en-US")}</span>
      </li>;
    })}</ul> : <p className="ls-empty">No cards yet. Export an idea from Forge and import the file below.</p>}

    <section className="ls-import" style={{ marginTop: 32 }}>
      <h2>Import a Forge export</h2>
      <p>The JSON file Forge writes for an idea. Its blocks are filed in the ledger under your name and embedded so the corpus can be matched. The card stays private until you publish it.</p>
      <ActionForm action={importForgeCard} className="ls-import">
        <label>Forge export<input type="file" name="file" accept="application/json,.json" required /></label>
        <SubmitButton>Import</SubmitButton>
      </ActionForm>
    </section>

    {member ? <section style={{ marginTop: 40 }}>
      <h2>The cohort</h2>
      {cohort.length ? <ul className="ls-list">{cohort.map(({ card, owner }) => <li key={card.ideaId}>
        <h2><Link href={`/lodestone/cards/${card.ideaId}`}>{card.title}</Link></h2>
        {card.line ? <p>{card.line}</p> : null}
        <span className="meta">{owner.name}{card.publishedAt ? ` · published ${card.publishedAt.toLocaleDateString("en-US")}` : ""}</span>
      </li>)}</ul> : <p className="ls-empty">Nobody else has published a card yet.</p>}
    </section> : null}
  </>;
}
