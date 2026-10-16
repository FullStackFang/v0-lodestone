import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { fieldFor } from "@/lodestone/field";
import { Pill, SectionHead } from "../../../ui";
import { FieldStage } from "./FieldStage";

export const dynamic = "force-dynamic";

const pct = (score: number) => `${Math.max(0, Math.min(100, Math.round(score * 100)))}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function FieldPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const db = await getDb();
  const person = await requirePerson(db);
  const field = await fieldFor(db, person.id, ideaId);
  if (!field) notFound();
  const peersWithin = field.nodes.filter((n) => n.kind === "peer" && n.close).length;
  const worksWithin = field.nodes.filter((n) => n.kind !== "peer" && n.close).length;
  const nearby = field.nodes.filter((n) => !n.close).length;
  const short = field.center.title.split(" ").slice(0, 3).join(" ") + (field.center.title.split(" ").length > 3 ? "…" : "");

  return <div className="wrap stack">
    <section style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Link className="back dark" href={`/lodestone/cards/${ideaId}`}><ArrowLeft size={14} />Back to the card</Link>
          <SectionHead n="05" title={<span className="h1-inline">The field around <em>{field.center.title}</em></span>} tone="var(--plum)" />
          <p className="lede" style={{ maxWidth: "62ch" }}>{field.center.mine ? "Your card" : `${field.center.owner}'s card`} at the centre; what sits closest fans out from it. Click a peer&apos;s card to open it, and its own field from there. Distance is cosine, the dashed ring is the {field.line.toFixed(2)} neighbour line, nothing here is scored by a model.</p>
          {!field.member ? <p className="note" style={{ maxWidth: "62ch" }}>Peers appear for active members. Prior art works for everyone.</p> : null}
        </div>
        <div className="key-row">
          <span className="key"><i style={{ background: "var(--ink)" }} />this card</span>
          <span className="key"><i style={{ background: "var(--plum)" }} />a peer&apos;s card</span>
          <span className="key"><i style={{ background: "var(--teal)" }} />paper</span>
          <span className="key"><i className="sq" />patent</span>
        </div>
      </div>
      <div className="stage">
        <FieldStage field={field} />
        <div className="stage-figs">
          <div className="fig"><b>{peersWithin}</b><span>peers within reach</span></div>
          <div className="fig"><b>{worksWithin}</b><span>works within reach</span></div>
          <div className="fig"><b>{nearby}</b><span>nearby, below the line</span></div>
        </div>
        <div className="stage-hint">{field.hasVectors
          ? "Hover a dot for its score; click a peer card to open it."
          : "This card has no vectors yet. Re-import it once an embedding key is configured."}</div>
      </div>
      {!field.hasVectors ? <p className="note">This card has no vectors yet. Re-import it once an embedding key is configured.</p> : null}
    </section>

    <section className="split" style={{ padding: "16px 0 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 className="serif" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0, fontWeight: 500 }}>The same field, as a list</h2>
        <p className="lede" style={{ fontSize: 15, maxWidth: "32ch" }}>Every dot above is one of these rows. The picture is for orientation; the rows are the record.</p>
        <Pill href={`/lodestone/cards/${ideaId}`} variant="line" arrow="right" small className="self-start">Open {short}</Pill>
      </div>
      <div>
        {field.nodes.length ? field.nodes.map((n, i) => {
          const peer = n.kind === "peer";
          const meta = `${peer ? `${n.meta} · peer card` : `${n.kind}${n.meta ? ` · ${n.meta}` : ""}`}${n.close ? " · within reach" : ""}`;
          return <div className={i === field.nodes.length - 1 ? "rk last" : "rk"} key={n.id}>
            <span className="n">{i + 1}</span>
            <span className="t">{n.title}<small>{meta}</small></span>
            <span className="bar" aria-hidden="true"><i className={n.close ? (peer ? "plum" : "") : "far"} style={{ width: pct(n.score) }} /><b style={{ left: `${field.line * 100}%` }} /></span>
            <span className="end">
              <span className={n.close ? "s" : "s far"}>{n.score.toFixed(2)}</span>
              {peer && n.href ? <Link className="lnk" href={n.href}>open ↗</Link> : n.href ? <a className="lnk" href={n.href} target="_blank" rel="noreferrer">source ↗</a> : null}
            </span>
          </div>;
        }) : <div className="empty"><p>{field.hasVectors ? "Nothing sits near this card yet." : "No vectors, so no field."}</p><span>{field.hasVectors ? `${plural(0, "work")} in the corpus and no cohort card come within the picture.` : "Re-import the card once an embedding key is configured."}</span></div>}
      </div>
    </section>
  </div>;
}
