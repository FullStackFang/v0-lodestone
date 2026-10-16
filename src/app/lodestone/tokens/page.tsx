import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { listTokens } from "@/lodestone/api";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { mintApiToken, revokeApiToken } from "./actions";
import { SectionHead } from "../ui";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function TokensPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const tokens = await listTokens(db, person.id);
  const live = tokens.filter((t) => !t.revokedAt);
  const cut = tokens.filter((t) => t.revokedAt);
  return <div className="wrap stack">
    <header className="mast drench">
      <Link className="back" href="/lodestone"><ArrowLeft size={14} />Your cards</Link>
      <div className="mast-copy">
        <span className="lab">API tokens</span>
        <h1 className="h1 title">Connect a client.</h1>
        <p className="line">A token lets Whetstone, or anything else you run, send your cards here and read what the network found for them. Each token acts as <b>you and only you</b>. Revoke one and the client is signed out at once.</p>
      </div>
    </header>

    <section className="panel paper split">
      <SectionHead n="01" title="New token" tone="var(--teal)">
        <p className="lede" style={{ maxWidth: "30ch" }}>Name it for the machine it will live on. The token is shown once, right after you create it.</p>
      </SectionHead>
      <ActionForm action={mintApiToken} className="field-card">
        <label>Label<input type="text" name="label" placeholder="Whetstone on my laptop" maxLength={60} required /></label>
        <SubmitButton>Create token</SubmitButton>
      </ActionForm>
    </section>

    <section className="panel blue split">
      <SectionHead n="02" title="Live tokens" tone="var(--blue)">
        <p className="lede" style={{ maxWidth: "30ch" }}>Each one is a client acting as you. Revoke what you no longer recognise.</p>
      </SectionHead>
      <div>
        {live.length ? live.map((t, i) => <div className={i === live.length - 1 ? "rk tok last" : "rk tok"} key={t.id}>
          <span className="n">{i + 1}</span>
          <span className="t">{t.label}<small>created {day(t.createdAt)}{t.lastUsedAt ? ` · last used ${day(t.lastUsedAt)}` : " · never used"}</small></span>
          <ActionForm action={revokeApiToken} className="rk-form">
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton secondary>Revoke</SubmitButton>
          </ActionForm>
        </div>) : <div className="empty"><p>No live tokens.</p><span>Create one above and paste it into the client&apos;s Lodestone settings.</span></div>}
      </div>
    </section>

    {cut.length ? <section className="panel paper split">
      <SectionHead n="03" title="Revoked" tone="var(--meta)">
        <p className="note">Kept for the record. A client still holding one is signed out.</p>
      </SectionHead>
      <div>{cut.map((t, i) => <div className={i === cut.length - 1 ? "rk tok muted last" : "rk tok muted"} key={t.id}>
        <span className="n">{i + 1}</span>
        <span className="t">{t.label}<small>revoked {day(t.revokedAt!)}</small></span>
        <span />
      </div>)}</div>
    </section> : null}
  </div>;
}
