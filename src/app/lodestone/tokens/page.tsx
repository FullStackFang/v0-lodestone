import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { listTokens } from "@/lodestone/api";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { mintApiToken, revokeApiToken } from "./actions";
import "../lodestone.css";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function TokensPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const tokens = await listTokens(db, person.id);
  const live = tokens.filter((t) => !t.revokedAt);
  const cut = tokens.filter((t) => t.revokedAt);
  return <article>
    <header className="ls-header">
      <div>
        <p className="eyebrow">Lodestone · API tokens</p>
        <h1>Connect a client</h1>
        <p>A token lets Whetstone, or anything else you run, send your cards here and read what the network found for them. Each token acts as you and only you. Revoke one and the client is signed out at once.</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav>
    </header>

    <section className="ls-import">
      <h2>New token</h2>
      <p>Name it for the machine it will live on. The token is shown once, right after you create it.</p>
      <ActionForm action={mintApiToken} className="ls-import">
        <label>Label<input type="text" name="label" placeholder="Whetstone on my laptop" maxLength={60} required /></label>
        <SubmitButton>Create token</SubmitButton>
      </ActionForm>
    </section>

    <section className="ls-section" style={{ marginTop: 32 }}>
      <h2>Live tokens</h2>
      {live.length ? <div className="ls-rows">{live.map((t) => <div className="ls-row" key={t.id}>
        <span className="t">{t.label}</span>
        <ActionForm action={revokeApiToken}>
          <input type="hidden" name="id" value={t.id} />
          <SubmitButton secondary>Revoke</SubmitButton>
        </ActionForm>
        <span className="meta">created {day(t.createdAt)}{t.lastUsedAt ? ` · last used ${day(t.lastUsedAt)}` : " · never used"}</span>
      </div>)}</div> : <div className="ls-quiet"><p>No live tokens.</p><span>Create one above and paste it into the client's Lodestone settings.</span></div>}
    </section>

    {cut.length ? <section className="ls-section" style={{ marginTop: 32 }}>
      <h2>Revoked</h2>
      <div className="ls-rows">{cut.map((t) => <div className="ls-row" key={t.id}>
        <span className="t">{t.label}</span>
        <span className="meta">revoked {day(t.revokedAt!)}</span>
      </div>)}</div>
    </section> : null}
  </article>;
}
