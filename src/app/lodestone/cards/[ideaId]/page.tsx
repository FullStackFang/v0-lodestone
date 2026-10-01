import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { canView, cardBlocks, cardById } from "@/lodestone/cards";
import { peersFor } from "@/lodestone/peers";
import { corpusSize, priorArtFor } from "@/lodestone/priorArt";
import { cohortCards } from "@/lodestone/cards";
import { isActiveMember } from "@/pilot/membership";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { setCardVisibility } from "../../actions";
import "../../lodestone.css";

export const dynamic = "force-dynamic";

const pct = (score: number) => `${Math.max(0, Math.min(100, Math.round(score * 100)))}%`;

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
  const [priorArt, corpus, peers, published] = await Promise.all([
    priorArtFor(db, ideaId, 5),
    corpusSize(db),
    member ? peersFor(db, ideaId, 5) : Promise.resolve([]),
    cohortCards(db),
  ]);
  const others = published.filter((c) => c.card.ideaId !== ideaId).length;

  return <article>
    <header className="ls-header">
      <div>
        <p className="eyebrow">Framework card · Business Model Canvas</p>
        <h1>{card.title}</h1>
        {card.line ? <p className="ls-line">{card.line}</p> : null}
        <p>{owner.name} · <span className={`ls-state ${card.visibility}`}>{card.visibility}</span> · {confirmed} of 9 blocks in the author's words</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav>
    </header>

    <div className="ls-grid">
      {blocks.map((b) => <section className="ls-block" key={b.key}>
        <span className="k">{b.label}</span>
        {b.entries.length ? b.entries.map((e, i) => <div className={`ls-entry ${e.origin}`} key={i}>
          {e.text}
          <span className="o">{e.origin === "confirmed" ? "confirmed" : e.origin === "draft" ? "draft" : "open question"}{e.segment ? ` · ${e.segment}` : ""}</span>
        </div>) : <span className="ls-empty">Nothing filed here yet.</span>}
      </section>)}
    </div>
    <div className="ls-legend"><span>plain = confirmed by the author</span><span><i>italic</i> = drafted by extraction</span><span><i>italic, red mark</i> = a question the thread has not answered</span></div>

    <div className="ls-two">
      <section className="ls-section">
        <h2>Prior art</h2>
        <p>Papers whose abstracts sit closest to a block of this card. {corpus} in the corpus. Works before anyone else has published.</p>
        {priorArt.length ? <div className="ls-rows">{priorArt.map((p) => <div className="ls-row" key={p.documentId}>
          <span className="t">{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</span>
          <span className="n">{p.score.toFixed(2)}</span>
          <span className="why">closest to <b>{p.blocks.join(", ")}</b></span>
          <span className="meta">{[p.venue, p.year, p.field].filter(Boolean).join(" · ") || "no metadata"}</span>
          <span className="bar"><i style={{ width: pct(p.score) }} /></span>
        </div>)}</div> : <div className="ls-quiet"><p>{corpus === 0 ? "The corpus is empty." : "This card has no vectors yet."}</p><span>{corpus === 0 ? "Ingest papers and embed their abstracts; the match runs against whatever the corpus holds." : "Re-import the card once an embedding key is configured."}</span></div>}
      </section>

      <section className="ls-section">
        <h2>Peers in the cohort</h2>
        <p>Cohort cards that share blocks with this one, explained by the blocks that came closest.</p>
        {!member ? <div className="ls-quiet"><p>Membership is needed to see the cohort.</p><span>Prior art still works without it.</span></div>
          : peers.length ? <div className="ls-rows">{peers.map((p) => <div className="ls-row" key={p.ideaId}>
            <span className="t"><Link href={`/lodestone/cards/${p.ideaId}`}>{p.title}</Link></span>
            <span className="n">{p.score.toFixed(2)}</span>
            <span className="why">{p.owner.name} · {p.shared.length ? <>shares <b>{p.shared.map((s) => s.mine).join(", ")}</b></> : "no block within reach"}</span>
            <span className="meta">{p.line}</span>
            <span className="bar"><i style={{ width: pct(p.score) }} /></span>
          </div>)}</div>
          : <div className="ls-quiet"><p>{others === 0 ? "No one else in the cohort has published a card yet." : "No cohort card shares a block with this one yet."}</p><span>{card.visibility === "private" && mine ? "Your card is private. Publishing to the cohort is what lets a classmate find it." : "Peers arrive as classmates publish."}</span></div>}
      </section>
    </div>

    {mine ? <section className="ls-publish">
      <h2>Publish</h2>
      <p>Who can see this card. Private is the default and one action away at any time.</p>
      <ActionForm action={setCardVisibility}>
        <input type="hidden" name="ideaId" value={card.ideaId} />
        <div className="ls-choices">
          <label className="ls-choice"><input type="radio" name="visibility" value="private" defaultChecked={card.visibility === "private"} /><span className="nm">Private</span><span className="ex">Only you. Prior-art matching still works, because the corpus comes to the card.</span></label>
          <label className="ls-choice"><input type="radio" name="visibility" value="cohort" defaultChecked={card.visibility === "cohort"} disabled={!member} /><span className="nm">This cohort</span><span className="ex">{member ? "Active members see the card and can be matched to it. It counts on the cohort map." : "Needs an active membership."}</span></label>
        </div>
        <div className="ls-leaves">
          <div><span style={{ color: "var(--ink)" }}>What the cohort sees</span><span>the nine blocks with their origin marks; your name</span></div>
          <div className="no"><span style={{ color: "var(--ink)" }}>The chat thread, the evidence sentences, the run log</span><span>never</span></div>
        </div>
        <SubmitButton>{card.visibility === "cohort" ? "Save" : "Save"}</SubmitButton>
      </ActionForm>
      <p className="ls-note">Withdrawing takes effect on the next read. The ledger rows beneath the card are never deleted; a re-import supersedes them.</p>
    </section> : null}
  </article>;
}
