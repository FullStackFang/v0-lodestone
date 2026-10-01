import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { getDb } from "@/db/client";
import { fieldsOf } from "@/db/cards";
import { requirePerson } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { experimentEvidence, experimentsForOwner, ownedIdea, publicFields, publicationFingerprint } from "@/review/revisions";
import { ThesisSheet } from "@/review/ThesisSheet";
import styles from "@/review/workspace.module.css";
import { publish } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const person = await requirePerson(db);
  const card = await ownedIdea(db, person.id, id).catch(() => null);
  if (!card) notFound();
  const experiments = await experimentsForOwner(db, person.id, id);
  const fields = publicFields(fieldsOf(card), experimentEvidence(experiments));
  return <article className={styles.publication}>
    <header className={styles.header}><div><p className={styles.meta}>Publication preview</p><h1>{fields.facets?.one_liner ?? fields.offering ?? "Untitled idea"}</h1></div><nav className={styles.tools}><Link href={`/ideas/${id}`}><ArrowLeft size={15} />Back to draft</Link></nav></header>
    <p className={styles.notice}>This revision contains the business fields below and experiment results you selected for sharing. Raw intake, resumes, founder profile and private source records stay private.</p>
    <ThesisSheet fields={fields} />
    <section className={styles.band}><h2>Publish revision</h2><ActionForm action={publish}>
      <input type="hidden" name="cardId" value={id} />
      <input type="hidden" name="preview" value={publicationFingerprint(fields)} />
      <label>Audience<select name="visibility" defaultValue="unlisted"><option value="unlisted">Anyone with this unlisted link</option><option value="cohort">Signed-in pilot cohort</option></select></label>
      <label className={styles.check}><input type="checkbox" name="confirmed" required />I reviewed these business claims and approve this revision for the selected audience.</label>
      <SubmitButton><Send size={15} />Publish revision</SubmitButton>
    </ActionForm></section>
  </article>;
}
