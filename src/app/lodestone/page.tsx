import type { ReactNode } from "react";
import Link from "next/link";
import { getDb } from "@/db/client";
import { currentMembership, requirePerson } from "@/lib/session";
import { blockLabel, cardBlocks, cardsForOwner, cohortCards, cohortCounts } from "@/lodestone/cards";
import { digestFor, weekAgo } from "@/lodestone/digest";
import { CLOSE } from "@/lodestone/geometry";
import { peersFor, type PeerHit } from "@/lodestone/peers";
import { corpusSize, type PaperHit } from "@/lodestone/priorArt";
import { ideaVectors } from "@/lodestone/vectors";
import { isActive, isOperator } from "@/pilot/membership";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { importForgeCard } from "./actions";
import { Chip, Go, Leader, Pill, SectionHead } from "./ui";

export const dynamic = "force-dynamic";
/** The import action's card search runs after it responds, inside this limit. */
export const maxDuration = 300;

const README = "https://github.com/fullstackfang/v0-lodestone#readme";
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const score = (n: number) => n.toFixed(2);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function season(d: Date): string {
  const m = d.getMonth();
  return `${m < 5 ? "Spring" : m < 8 ? "Summer" : "Fall"} ${d.getFullYear()}`;
}

/** The Monday of the week the date falls in. */
function monday(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return out;
}

const labels = (keys: string[]) => keys.map((k, i) => <span key={k}>{i ? ", " : ""}<b>{blockLabel(k).toLowerCase()}</b></span>);

/** The shared blocks of a peer hit, by the block names on this card. */
const sharedKeys = (hit: PeerHit) => [...new Set(hit.shared.map((s) => s.mine))];

type DigestRow = { key: string; kind: "peer" | "paper" | "patent"; title: string; href: string; why: ReactNode; score: number };

export default async function LodestonePage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const now = new Date();
  const [cards, membership, counts, corpus, published] = await Promise.all([
    cardsForOwner(db, person.id),
    currentMembership(),
    cohortCounts(db),
    corpusSize(db),
    cohortCards(db),
  ]);
  const member = isActive(membership);
  const operator = isOperator(person, membership);
  // Read once and handed to the digest and to every card's peers. Only a
  // member is matched against the cohort, so only a member needs them.
  const vectors = member ? await ideaVectors(db, [...new Set([...cards, ...published.map((c) => c.card)].map((c) => c.ideaId))]) : undefined;
  const [digest, peerLists] = await Promise.all([
    digestFor(db, person.id, weekAgo(now), now, { cards, cohort: published, member, vectors }),
    Promise.all(cards.map((card) => (member ? peersFor(db, card.ideaId, 8, published, vectors) : []))),
  ]);
  // The cohort's published cards, for members only: nine blocks and an
  // owner name, the same rule the card page enforces.
  const cohort = member ? published.filter((c) => c.owner.id !== person.id) : [];
  // Every peer of every card the person owns, keyed by the peer's idea.
  const peersByCard = new Map<string, PeerHit[]>(cards.map((card, at) => [card.ideaId, peerLists[at]]));
  const nearest = new Map<string, { hit: PeerHit; mine: string }>();
  for (const card of cards) for (const hit of peersByCard.get(card.ideaId) ?? []) {
    const seen = nearest.get(hit.ideaId);
    if (!seen || hit.score > seen.hit.score) nearest.set(hit.ideaId, { hit, mine: card.title });
  }
  const closest = [...nearest.values()].sort((a, b) => b.hit.score - a.hit.score)[0] ?? null;

  const fresh = new Map<string, PaperHit>();
  for (const s of digest.sections) for (const p of s.papers) if (!fresh.has(p.documentId)) fresh.set(p.documentId, p);
  const withinReach = [...fresh.values()].filter((p) => p.score >= CLOSE).length;
  const headline = digest.sections.find((s) => s.peers.length || s.papers.length);

  const rows: DigestRow[] = digest.sections.flatMap((s) => [
    ...s.peers.map((p): DigestRow => ({
      key: `${s.ideaId}:${p.ideaId}`, kind: "peer", title: p.title, href: `/lodestone/cards/${p.ideaId}`, score: p.score,
      why: <>{p.owner.name}{p.publishedAt ? ` published ${day(p.publishedAt)}` : ""}{sharedKeys(p).length ? <> · shares {labels(sharedKeys(p))} with {s.title}</> : <> · nearest to {s.title}, below the line</>}</>,
    })),
    ...s.papers.map((p): DigestRow => ({
      key: `${s.ideaId}:${p.documentId}`, kind: p.kind, title: p.title, href: p.url ?? `/lodestone/cards/${s.ideaId}`, score: p.score,
      why: <>added {day(p.addedAt)} · closest to {labels(p.blocks)}{p.year ? ` · ${p.year}` : ""}{p.venue ? ` · ${p.venue}` : ""}</>,
    })),
  ]).sort((a, b) => b.score - a.score).slice(0, 6);

  const privateCount = Math.max(0, counts.working - counts.published);

  return <div className="wrap stack">
    <section className="hero drench">
      <div className="hero-copy">
        <span className="hero-rule" />
        <span className="lab">{member ? `${season(now)} cohort · week of ${day(monday(now))}` : "Not yet a member"}</span>
        <h1 className="h1 display">Where your idea sits in the field.</h1>
        <p className="line">A card is matched to <b>prior art</b> and to <b>peers</b> before anyone else has published. No model is called on the server: every match is a stored record and the block it matched on.</p>
        <div className="hero-actions">
          <Pill href="#import" variant="paper" arrow="right">Import a Forge export</Pill>
          <Pill href={README} variant="ghost" arrow="up">How matching works</Pill>
        </div>
      </div>
      <aside className="nameplate">
        <div className="nameplate-head">
          <span className="lab">This week&apos;s digest</span>
          <span className="lab">{day(digest.since)} <span style={{ opacity: 0.6 }}>to {day(digest.until)}</span></span>
        </div>
        <div className="nameplate-bar" />
        <p className="nameplate-title">{headline
          ? <>{plural(headline.papers.length, "new paper")} and {plural(headline.peers.length, "peer")} bear on <em>{headline.title}</em>.</>
          : "Nothing new bears on your cards this week."}</p>
        <div className="nameplate-hair" />
        <span className="lab also">Also on Lodestone</span>
        <div className="leaders">
          <Leader n="02" href="#cohort">The cohort&apos;s published cards</Leader>
          {operator ? <Leader n="03" href="/lodestone/map">Cohort map</Leader> : null}
          {operator ? <Leader n="04" href="/lodestone/roster">Roster</Leader> : null}
          <Leader n={operator ? "05" : "03"} href="/lodestone/tokens">API tokens for Whetstone</Leader>
        </div>
      </aside>
      <div className="insights">
        <Link className="insight blue" href="#cohort">
          <div className="fig" style={{ color: "var(--navy-block)" }}>{counts.published}<small>of {counts.members}</small></div>
          <div><span className="lab" style={{ color: "var(--navy-block)" }}>Published</span><p>members have published a card to the cohort. <b>{privateCount === 0 ? "None are" : `${privateCount} ${privateCount === 1 ? "is" : "are"}`} still private</b> and still match against the corpus.</p></div>
          <div className="foot"><span>Cohort · {plural(counts.members, "member")}</span><Go tone="var(--navy-block)" /></div>
        </Link>
        <Link className="insight lilac" href={closest ? `/lodestone/cards/${closest.hit.ideaId}` : "#cohort"}>
          <div className="fig" style={{ color: "var(--plum)" }}>{closest ? score(closest.hit.score) : <>0<small>pairs</small></>}</div>
          <div><span className="lab" style={{ color: "var(--plum)" }}>Closest peer</span><p>{closest
            ? <>the nearest published card to yours, on {labels(sharedKeys(closest.hit))}. {closest.hit.score >= CLOSE ? "Above" : "Below"} the {score(CLOSE)} neighbour line.</>
            : <>no pairs yet. A pair appears when a cohort card shares a block with one of yours.</>}</p></div>
          <div className="foot"><span>Cosine · stored, not generated</span><Go tone="var(--plum)" /></div>
        </Link>
        <Link className="insight aqua" href="/lodestone/digest">
          <div className="fig" style={{ color: "var(--teal)" }}>{fresh.size}</div>
          <div><span className="lab" style={{ color: "var(--teal)" }}>New in the corpus</span><p>papers and patents added this week that bear on your cards; <b>{withinReach} sit within reach</b> of a card you own.</p></div>
          <div className="foot"><span>Corpus · {plural(corpus, "document")}</span><Go tone="var(--teal)" /></div>
        </Link>
      </div>
    </section>

    <section className="panel navy split" id="cards">
      <SectionHead n="01" title="Your cards" tone="var(--aqua)">
        <p className="lede">One card per idea, nine blocks of the Business Model Canvas, each block marked by who said it: you, the extraction, or nobody yet.</p>
        <p className="note">Private is the default and one action away. The cohort sees the nine blocks and your name, never the thread.</p>
      </SectionHead>
      <div className="grid2">
        {cards.map((card) => {
          const { blocks, confirmed } = cardBlocks(card.doc);
          const peers = peersByCard.get(card.ideaId) ?? [];
          return <Link className="tile" key={card.ideaId} href={`/lodestone/cards/${card.ideaId}`}>
            <div className="meta">{card.visibility === "cohort" ? <Chip tone="lime">Cohort</Chip> : <Chip tone="ghost">Private</Chip>}<span>updated {day(card.updatedAt)}</span></div>
            <h3>{card.title}</h3>
            {card.line ? <p>{card.line}</p> : null}
            <div className="rail" aria-hidden="true">{blocks.map((b) => <i key={b.key} className={{ confirmed: "c", draft: "d", open: "o" }[b.entries[0]?.origin ?? ""] ?? ""} />)}</div>
            <div className="meta"><span>{confirmed} of 9 blocks in your words</span><span>{peers.length ? plural(peers.length, "peer") : member ? "no peers yet" : "private"}</span></div>
          </Link>;
        })}
        <div className="tile next" id="import">
          <span className="lab">Next card</span>
          <p className="serif" style={{ fontSize: 22, lineHeight: 1.2, color: "var(--paper)", fontStyle: "italic", maxWidth: "22ch" }}>Export an idea from Forge, drop the JSON here.</p>
          <ActionForm action={importForgeCard} className="tile-form">
            <label>Forge export (.json)<input type="file" name="file" accept="application/json,.json" required /></label>
            <SubmitButton>Import</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </section>

    <section className="panel blue" id="cohort">
      <div className="split" style={{ marginBottom: 36 }}>
        <SectionHead n="02" title="The cohort" tone="var(--blue)" />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <p className="lede" style={{ maxWidth: "52ch" }}>{member
            ? <>{cohort.length ? `${plural(cohort.length, "card")} published by other members this term.` : "No other member has published a card yet."} Each shows its nine blocks with their origin marks and the owner&apos;s name. The thread, the evidence and the run log never leave the author&apos;s machine.</>
            : "Not yet a member of this cohort. Your cards stay private and still match against the corpus; publishing needs an invitation."}</p>
          {member ? <Pill href="/lodestone/digest" variant="ink" arrow="right">This week&apos;s digest</Pill> : null}
        </div>
      </div>
      {member && cohort.length ? <>
        <div className="rows-head" aria-hidden="true"><span className="lab">Card</span><span className="lab">Owner</span><span className="lab">Published</span><span /></div>
        {cohort.map(({ card, owner }) => {
          const near = nearest.get(card.ideaId);
          return <Link className="row" key={card.ideaId} href={`/lodestone/cards/${card.ideaId}`}>
            <span className="t">{card.title}<small>{near ? sharedKeys(near.hit).length ? <>Shares {labels(sharedKeys(near.hit))} with your {near.mine} card · {score(near.hit.score)}</> : <>Nearest to your {near.mine} card · {score(near.hit.score)}, below the line</> : "No block within reach of yours"}</small></span>
            <span className="m">{owner.name}</span>
            <span className="m">{card.publishedAt ? day(card.publishedAt) : ""}</span>
            <Go kind="right" />
          </Link>;
        })}
      </> : member ? <div className="empty"><p>Nobody else has published a card yet.</p><span>Publish one of yours and it appears here for the others.</span></div> : null}
    </section>

    <section className="panel teal band">
      <svg aria-hidden="true" className="arcs" width="420" height="420" viewBox="0 0 420 420" fill="none" stroke="rgba(156,242,242,.18)" strokeWidth="2"><circle cx="420" cy="420" r="160" /><circle cx="420" cy="420" r="260" /><circle cx="420" cy="420" r="360" /></svg>
      <p>Nothing here was written by a model. Every row is a stored record and the block it matched on.</p>
      <span className="lab">The Lodestone rule: ranks, never grades</span>
    </section>

    <section className="panel paper split" id="digest">
      <SectionHead n="03" title="This week" tone="var(--plum)">
        <p className="lede" style={{ maxWidth: "30ch" }}>What newly bears on your cards, {day(digest.since)} to {day(digest.until)}. Mailed Monday; always here.</p>
        <Pill href="/lodestone/digest" variant="line" arrow="right" className="self-start">Open the digest</Pill>
      </SectionHead>
      <div>
        {rows.length ? rows.map((r) => <div className="drow" key={r.key}>
          {r.kind === "peer" ? <Chip tone="lime">New card</Chip> : <Chip tone="ghost">{r.kind === "patent" ? "Patent" : "Corpus"}</Chip>}
          <div><div className="t">{r.href.startsWith("http") ? <a href={r.href} target="_blank" rel="noreferrer">{r.title}</a> : <Link href={r.href}>{r.title}</Link>}</div><div className="why">{r.why}</div></div>
          <span className="s">{score(r.score)}</span>
        </div>) : <div className="empty"><p>Nothing new bears on your cards this week.</p><span>The corpus grows nightly; the cohort publishes when it is ready.</span></div>}
      </div>
    </section>
  </div>;
}
