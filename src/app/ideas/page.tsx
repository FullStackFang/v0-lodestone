import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { ideasForOwner } from "@/review/revisions";
import styles from "@/review/workspace.module.css";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const ideas = await ideasForOwner(db, person.id);
  return <>
    <header className={styles.header}><div><h1>Your ideas</h1><p>{person.name}</p></div><div className={styles.tools}><Link href="/new"><Plus size={16} />New idea</Link></div></header>
    {ideas.length ? <ul className={styles.list}>{ideas.map(({ card }) => <li key={card.id}>
      <h2><Link href={`/ideas/${card.id}`}>{card.facets?.one_liner ?? card.offering ?? card.ideaText ?? "Untitled idea"}</Link></h2>
      {card.segment?.description ? <p>{card.segment.description}</p> : null}
      <Link href={`/resources?card=${card.id}`}>Research for this idea <ArrowRight size={14} /></Link>
      <div className={styles.inline}><span className={styles.meta}>Private draft · Updated {card.updatedAt.toLocaleDateString("en-US")}</span><Link href={`/t/${card.id}`} className={styles.inline}>Continue conversation <ArrowRight size={14} /></Link></div>
    </li>)}</ul> : <p className={styles.empty}>No ideas yet.</p>}
  </>;
}
