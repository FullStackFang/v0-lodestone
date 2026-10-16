import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { blockLabel, canView, cardBlocks, cardById, cohortCards } from "@/lodestone/cards";
import { CLOSE } from "@/lodestone/geometry";
import { peersFor } from "@/lodestone/peers";
import { corpusSize, priorArtFor, type PaperHit } from "@/lodestone/priorArt";
import { isActiveMember } from "@/pilot/membership";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { setCardVisibility } from "../../actions";
import { Chip, Go, Pill, SectionHead } from "../../ui";

export const dynamic = "force-dynamic";

const pct = (score: number) => `${Math.max(0, Math.min(100, Math.round(score * 100)))}%`;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ORIGIN = {
  confirmed: { chip: "navy", label: "Confirmed", text: "e" },
  draft: { chip: "amber", label: "Draft", text: "e d" },
  open: { chip: "ox", label: "Open question", text: "e o" },
} as const;

function PaperRow({ p, n, last }: { p: PaperHit; n: number; last: boolean }) {
  const close = p.score >= CLOSE;
  const meta = [p.venue, p.year, p.field, p.querySet && <>set <i>{p.querySet}</i></>].filter(Boolean);
  const body = <>
    <span className="n">{n}</span>
    <span className="t">{p.title}<small>
      {p.kind === "patent" ? <><Chip tone="ghost">Patent</Chip> </> : null}
      {meta.map((m, i) => <span key={i}>{m}{" · "}</span>)}
      closest to <b>{p.blocks.map(blockLabel).join(", ").toLowerCase()}</b>
      {p.yours ? <> · <span className="yours">yours: the paper this idea started from</span></> : null}
    </small></span>
    <span className="bar" aria-hidden="true"><i className={close ? "" : "far"} style={{ width: pct(p.score) }} /><b style={{ left: `${CLOSE * 100}%` }} /></span>
    <span className={close ? "s" : "s far"}>{p.score.toFixed(2)}</span>
  </>;
  const cls = last ? "rk last" : "rk";
  return p.url ? <a className={cls} href={p.url} target="_blank" rel="noreferrer">{body}</a> : <div className={cls}>{body}</div>;
}

export default async function CardPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const db = await getDb();
  const person = await requirePerson(db);
  const found = await cardById(db, ideaId);
  if (!found || !(await canView(db, person.id, found.card))) notFound();
  const { card, owner } = found;
  const mine = card.ownerId === person.id;
  const member = await isActiveMember(db, person.id);
  const { blocks, confirmed } = cardBlocks(card.doc);
  const drafts = blocks.filter((b) => b.entries[0]?.origin === "draft").length;
  const open = blocks.filter((b) => b.entries[0]?.origin === "open").length;
  const [priorArt, corpus, peers, published] = await Promise.all([
    priorArtFor(db, ideaId, 8),
    corpusSize(db),
    member ? peersFor(db, ideaId, 6) : Promise.resolve([]),
    cohortCards(db),
  ]);
  const others = published.filter((c) => c.card.ideaId !== ideaId).length;
  const near = priorArt.filter((p) => p.score >= CLOSE);
  const far = priorArt.filter((p) => p.score < CLOSE);
  const best = Math.max(0, ...priorArt.map((p) => p.score), ...peers.map((p) => p.score));

  return <article className="wrap stack">
    <header className="mast drench">
      <Link className="back" href="/lodestone"><ArrowLeft size={14} />Your cards</Link>
      <div className="mast-grid">
        <div className="mast-copy">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {card.visibility === "cohort" ? <Chip tone="lime">Cohort</Chip> : <Chip tone="glass">Private</Chip>}
            <span className="lab">Framework card · Business Model Canvas</span>
          </div>
          <h1 className="h1 mast">{card.title}</h1>
          {card.line ? <p className="line">{card.line}</p> : null}
          <p className="meta">{owner.name} · {card.publishedAt && card.visibility === "cohort" ? `published ${day(card.publishedAt)}` : "private"} · <b>{confirmed} of 9</b> blocks in the author&apos;s words · {drafts} drafted · {plural(open, "open question")}</p>
          <div className="hero-actions"><Pill href={`/lodestone/cards/${ideaId}/field`} variant="paper" arrow="right">See the field</Pill></div>
        </div>
        <div className="stats">
          <div className="stat"><b style={{ color: "var(--aqua)" }}>{near.length}</b><span className="lab">Prior art within reach</span></div>
          <div className="stat"><b style={{ color: "var(--pink)" }}>{peers.length}</b><span className="lab">Peers in the cohort</span></div>
          <div className="stat"><b style={{ color: "var(--lime)" }}>{best ? best.toFixed(2) : "–"}</b><span className="lab">Closest match</span></div>
        </div>
      </div>
    </header>

    <section className="panel blue">
      <div className="blocks-head">
        <SectionHead n="01" title="The nine blocks" tone="var(--blue)" />
        <div className="legend">
          <span><i style={{ background: "var(--navy-block)" }} />confirmed by the author</span>
          <span><i style={{ background: "var(--amber)" }} /><em className="serif">drafted by extraction</em></span>
          <span><i style={{ background: "var(--oxblood)" }} /><em className="serif">open question</em></span>
        </div>
      </div>
      <div className="grid3">
        {blocks.map((b) => {
          const first = b.entries[0];
          const o = first ? ORIGIN[first.origin] : null;
          return <div className={first?.origin === "open" ? "block open" : "block"} key={b.key}>
            <div className="k"><span className="lab">{b.label}</span>{o ? <Chip tone={o.chip}>{o.label}</Chip> : null}</div>
            {b.entries.length ? b.entries.map((e, i) => <p className={ORIGIN[e.origin].text} key={i}>{e.text}</p>) : <p className="e o">Nothing filed here yet.</p>}
            {first?.segment ? <span className="seg">{first.segment}</span> : null}
          </div>;
        })}
      </div>
    </section>

    <section className="panel paper split">
      <SectionHead n="02" title="Prior art" tone="var(--teal)">
        <p className="lede" style={{ maxWidth: "30ch" }}>Papers and patents whose abstracts sit closest to a block of this card. Ranked by cosine against {plural(corpus, "stored abstract")}.</p>
        <p className="note" style={{ maxWidth: "30ch" }}>The neighbour line is {CLOSE.toFixed(2)}. Works before anyone else has published; nothing here is scored by a model.</p>
      </SectionHead>
      <div>
        <div className="tier"><Chip tone="lime">Within reach</Chip><span className="t">Above the neighbour line</span><span className="ct">{plural(near.length, "work")}</span></div>
        {near.map((p, i) => <PaperRow key={p.documentId} p={p} n={i + 1} last={i === near.length - 1 && far.length === 0} />)}
        {near.length === 0 ? <div className="empty" style={{ marginTop: 8 }}>
          <p>{priorArt.length ? "Nothing above the line yet." : corpus === 0 ? "The corpus is empty." : "This card has no vectors yet."}</p>
          <span>{priorArt.length ? "The nearby works below are the closest the corpus holds." : corpus === 0 ? "Ingest papers and embed their abstracts; the match runs against whatever the corpus holds." : "Re-import the card once an embedding key is configured."}</span>
        </div> : null}
        {far.length ? <>
          <div className="tier far"><Chip tone="ghost">Nearby</Chip><span className="t">Below the line</span><span className="ct">{plural(far.length, "work")}</span></div>
          {far.map((p, i) => <PaperRow key={p.documentId} p={p} n={near.length + i + 1} last={i === far.length - 1} />)}
        </> : null}
      </div>
    </section>

    <section className="panel plum split">
      <SectionHead n="03" title="Peers" tone="var(--pink)">
        <p className="lede" style={{ maxWidth: "32ch" }}>Published cards in this cohort with a block within reach of one of this card&apos;s. You see their nine blocks and a name; the thread stays theirs.</p>
        <p className="note">Members only.</p>
      </SectionHead>
      {!member ? <div className="empty"><p>Membership is needed to see the cohort.</p><span>Prior art still works without it.</span></div>
        : peers.length ? <div className="grid2">{peers.map((p) => {
          const shared = [...new Set(p.shared.map((s) => s.mine))];
          return <Link className="peer" key={p.ideaId} href={`/lodestone/cards/${p.ideaId}`}>
            <div className="head"><span className="lab">{p.owner.name}{p.publishedAt ? ` · ${day(p.publishedAt)}` : ""}</span><span className="score">{p.score.toFixed(2)}</span></div>
            <h3>{p.title}</h3>
            {p.line ? <p>{p.line}</p> : null}
            {shared.length ? <><p>Shares with this card:</p><div className="shared">{shared.map((k) => <Chip tone="plum" key={k}>{blockLabel(k)}</Chip>)}</div></> : <p>No block within reach.</p>}
            <div className="foot"><span>{plural(shared.length, "shared block")}</span><Go tone="var(--plum)" /></div>
          </Link>;
        })}</div>
        : <div className="empty"><p>{others === 0 ? "No one else in the cohort has published a card yet." : "No cohort card shares a block with this one yet."}</p><span>{card.visibility === "private" && mine ? "Your card is private. Publishing to the cohort is what lets a classmate find it." : "Peers arrive as classmates publish."}</span></div>}
    </section>

    {mine ? <section className="panel paper split">
      <SectionHead n="04" title="Visibility" tone="var(--meta)">
        <p className="lede" style={{ maxWidth: "30ch" }}>Private is the default. Publishing is one action, and so is taking it back.</p>
        <p className="note">Withdrawing takes effect on the next read. The ledger rows beneath the card are never deleted; a re-import supersedes them.</p>
      </SectionHead>
      <div className="two" style={{ gap: 40, alignItems: "start" }}>
        <ActionForm action={setCardVisibility} className="choices">
          <input type="hidden" name="ideaId" value={card.ideaId} />
          <label className="choice"><input type="radio" name="visibility" value="cohort" defaultChecked={card.visibility === "cohort"} disabled={!member} /><span className="nm">Cohort</span><span className="ex">{member ? "Active members see the nine blocks, their origin marks and your name. It counts on the cohort map." : "Needs an active membership."}</span></label>
          <label className="choice"><input type="radio" name="visibility" value="private" defaultChecked={card.visibility === "private"} /><span className="nm">Private</span><span className="ex">Only you. The card still matches against the corpus and the digest still reaches you.</span></label>
          <SubmitButton>Save visibility</SubmitButton>
        </ActionForm>
        <div>
          <span className="lab" style={{ color: "var(--meta)" }}>What leaves your machine</span>
          <div className="leaves">
            <div className="leaf">Nine blocks with origin marks<span>yes</span></div>
            <div className="leaf">Your name and the publish date<span>yes</span></div>
            <div className="leaf">Block vectors, for matching<span>yes</span></div>
            <div className="leaf no">The Forge thread<span>never</span></div>
            <div className="leaf no">Evidence sentences<span>never</span></div>
            <div className="leaf no">The run log and any grade<span>never</span></div>
          </div>
        </div>
      </div>
    </section> : null}
  </article>;
}
