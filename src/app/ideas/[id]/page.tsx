import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, Save, Send, FlaskConical, LockKeyhole, BookOpen, Bookmark } from "lucide-react";
import { getDb } from "@/db/client";
import { fieldsOf } from "@/db/cards";
import { requirePerson } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { editorSections } from "@/review/editor";
import { experimentsForOwner, ownedIdea, revisionsForOwner, reviewsForOwner, REVIEW_COMPONENTS, type ReviewComponent } from "@/review/revisions";
import { EVIDENCE_LABELS } from "@/review/ThesisSheet";
import styles from "@/review/workspace.module.css";
import { planExperiment, respond, revoke, saveExperiment, saveGroup } from "../actions";

export const dynamic = "force-dynamic";

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const person = await requirePerson(db);
  const card = await ownedIdea(db, person.id, id).catch(() => null);
  if (!card) notFound();
  const f = fieldsOf(card);
  const [revisions, reviews, experiments] = await Promise.all([revisionsForOwner(db, person.id, id), reviewsForOwner(db, person.id, id), experimentsForOwner(db, person.id, id)]);

  return <>
    <header className={styles.header}><div><p className={styles.meta}>Private workspace</p><h1>{f.facets?.one_liner ?? f.offering ?? f.idea_text ?? "Untitled idea"}</h1></div><nav className={styles.tools}>
      <Link href="/ideas"><ArrowLeft size={15} />All ideas</Link><Link href={`/t/${id}`}><MessageSquare size={15} />Conversation</Link>
    </nav></header>
    <div className={styles.workspace}><div className={styles.main}>
      <section><h2>Current draft</h2><p className={styles.meta}>Author corrections do not establish customer evidence.</p>
        {editorSections(f).map((group) => <details className={styles.editor} key={group.id} open={group.id === "thesis"}>
          <summary>{group.title}</summary><ActionForm action={saveGroup}>
            <input type="hidden" name="cardId" value={id} /><input type="hidden" name="group" value={group.id} />
            <div className={styles.fields}>{group.fields.map((field) => <label key={field.name} className={field.multiline ? styles.wide : undefined}>{field.label}
              {field.options ? <select key={field.value} name={field.name} defaultValue={field.value}><option value="">Unknown</option>{field.options.map((v) => <option key={v} value={v}>{v === "true" ? "Yes" : v === "false" ? "No" : v.replaceAll("_", " ")}</option>)}</select>
                : field.multiline ? <textarea key={field.value} name={field.name} defaultValue={field.value} rows={3} maxLength={12000} />
                : <input key={field.value} name={field.name} type={field.numeric ? "number" : "text"} defaultValue={field.value} min={0} max={group.id === "rubric" ? 5 : undefined} step={1} maxLength={12000} />}
            </label>)}</div><SubmitButton><Save size={15} />Save {group.title.toLowerCase()}</SubmitButton>
          </ActionForm>
        </details>)}
      </section>
      <section className={styles.band} id="reviews"><h2>Reviews</h2>
        {reviews.length ? reviews.map((review) => <article className={styles.feedback} key={review.id}>
          <h3>{REVIEW_COMPONENTS[review.component as ReviewComponent]} · {review.kind}</h3>
          <div className={styles.meta}>{review.reviewerName} · Revision {review.version} · {review.createdAt.toLocaleDateString("en-US")}</div><p>{review.text}</p>
          <ActionForm action={respond}><input type="hidden" name="cardId" value={id} /><input type="hidden" name="reviewId" value={review.id} />
            <label>Disposition<select key={review.disposition ?? "deferred"} name="disposition" defaultValue={review.disposition ?? "deferred"}><option value="addressed">Addressed</option><option value="deferred">Deferred</option><option value="disagreed">Disagreed</option></select></label>
            <label>Author response<textarea key={review.response ?? ""} name="response" defaultValue={review.response ?? ""} rows={3} maxLength={12000} required /></label>
            <SubmitButton secondary><Send size={15} />Record response</SubmitButton>
          </ActionForm>
        </article>) : <p className={styles.empty}>No reviews yet.</p>}
      </section>
      <section className={styles.band} id="experiments"><h2>Experiments</h2>
        {experiments.map((experiment) => <article className={styles.band} key={experiment.id}>
          <h3>{experiment.hypothesis}</h3><p><strong>Method:</strong> {experiment.method}</p><p><strong>Decision criterion:</strong> {experiment.criterion}</p>
          <ActionForm action={saveExperiment}><input type="hidden" name="cardId" value={id} /><input type="hidden" name="experimentId" value={experiment.id} />
            <label>Status<select key={experiment.status} name="status" defaultValue={experiment.status}><option value="planned">Planned</option><option value="running">Running</option><option value="complete">Complete</option></select></label>
            <label>Result<textarea key={experiment.result ?? ""} name="result" defaultValue={experiment.result ?? ""} rows={3} maxLength={12000} /></label>
            <label>Evidence classification<select key={experiment.evidenceType ?? ""} name="evidenceType" defaultValue={experiment.evidenceType ?? ""}><option value="">Not classified</option>{Object.entries(EVIDENCE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className={styles.check}><input key={String(experiment.shareResult)} type="checkbox" name="shareResult" defaultChecked={experiment.shareResult} />Include this completed result in the next publication</label>
            <SubmitButton secondary><Save size={15} />Save experiment</SubmitButton>
          </ActionForm>
        </article>)}
        <details className={styles.editor} open={experiments.length === 0}><summary>Plan an experiment</summary><ActionForm action={planExperiment}>
          <input type="hidden" name="cardId" value={id} />
          <label>Hypothesis<textarea name="hypothesis" defaultValue={f.kill_assumption?.assumption ?? ""} rows={2} required maxLength={12000} /></label>
          <label>Method<textarea name="method" defaultValue={f.kill_assumption?.cheapest_test?.description ?? ""} rows={3} required maxLength={12000} /></label>
          <label>Decision criterion<textarea name="criterion" defaultValue={f.kill_assumption?.cheapest_test?.kill_criterion ?? ""} rows={2} required maxLength={12000} /></label>
          <label>Related revision<select name="revisionId" defaultValue=""><option value="">Current draft</option>{revisions.map((r) => <option key={r.id} value={r.id}>Revision {r.version}</option>)}</select></label>
          <SubmitButton><FlaskConical size={15} />Plan experiment</SubmitButton>
        </ActionForm></details>
      </section>
    </div><aside className={styles.sidebar}>
      <section className={styles.band}><h2>Publication</h2><div className={styles.tools}><Link href={`/ideas/${id}/publish`}><Send size={15} />Preview and publish</Link></div></section>
      <section className={styles.band}><h2>Connections</h2><nav aria-label="Idea connections" className={styles.form}>
        <div className={styles.tools}><Link href={`/resources?card=${id}`}><BookOpen size={15} />Resource watch</Link></div>
        <div className={styles.tools}><Link href="/library/saved"><Bookmark size={15} />Saved components</Link></div>
      </nav></section>
      <section className={styles.band}><h2>Revisions</h2>{revisions.length ? <ul className={styles.list}>{revisions.map((revision) => <li key={revision.id}>
        <strong>{revision.revokedAt ? `Revision ${revision.version}` : <Link href={`/c/${card.slug}?v=${revision.version}`}>Revision {revision.version}</Link>}</strong>
        <p className={styles.meta}>{revision.revokedAt ? "Revoked" : revision.visibility === "cohort" ? "Cohort" : "Unlisted"} · {revision.createdAt.toLocaleDateString("en-US")}</p>
        {!revision.revokedAt ? <ActionForm action={revoke}><input type="hidden" name="cardId" value={id} /><input type="hidden" name="revisionId" value={revision.id} /><SubmitButton secondary><LockKeyhole size={14} />Revoke access</SubmitButton></ActionForm> : null}
      </li>)}</ul> : <p className={styles.empty}>Not published.</p>}</section>
    </aside></div>
  </>;
}
