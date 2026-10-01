import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, MessageSquare, ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { currentPerson, ensureSession } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { readPublication, reviewsForRevision, REVIEW_COMPONENTS, type ReviewComponent } from "@/review/revisions";
import { ThesisSheet } from "@/review/ThesisSheet";
import styles from "@/review/workspace.module.css";
import { submitReview } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function CardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ v?: string }> }) {
  const { slug } = await params;
  const search = await searchParams;
  const db = await getDb();
  const sessionId = await ensureSession(db);
  const viewer = sessionId ? await currentPerson(db, sessionId) : null;
  const publication = await readPublication(db, slug, viewer?.id ?? null, search?.v === undefined ? undefined : Number(search.v));
  if (!publication) {
    if (!viewer) {
      const requestedUrl = `/c/${encodeURIComponent(slug)}${search?.v === undefined ? "" : `?${new URLSearchParams({ v: search.v })}`}`;
      redirect(`/login?next=${encodeURIComponent(requestedUrl)}`);
    }
    notFound();
  }
  const { revision } = publication;
  const reviews = await reviewsForRevision(db, revision.id, viewer?.id ?? null);
  const owner = viewer?.id === revision.ownerId;
  const url = `/c/${slug}?v=${revision.version}`;

  return <article className={styles.publication}>
    <header className={styles.header}><div><p className={styles.meta}>Business Thesis Card - Revision {revision.version}</p><h1>{revision.fields.facets?.one_liner ?? revision.fields.offering ?? "Business Thesis Card"}</h1>
      <p className={styles.meta}>Author-approved publication - {revision.createdAt.toLocaleDateString("en-US")} - {revision.visibility === "cohort" ? "Pilot cohort" : "Unlisted"}</p>
    </div><nav className={styles.tools}>{owner ? <Link href={`/ideas/${revision.cardId}`}><ArrowLeft size={15} />Workspace</Link> : null}<a href={`/c/${slug}/json?v=${revision.version}`}><Download size={15} />JSON</a></nav></header>
    <ThesisSheet fields={revision.fields} />
    <section className={styles.band} id="reviews"><h2>Reviews of revision {revision.version}</h2>
      {reviews.length ? reviews.map((review) => <article className={styles.feedback} key={review.id}>
        <h3>{REVIEW_COMPONENTS[review.component as ReviewComponent]} - {review.kind}</h3><p className={styles.meta}>{review.reviewerName} - {review.createdAt.toLocaleDateString("en-US")}</p><p>{review.text}</p>
        {review.disposition ? <div className={styles.response}><strong>{review.disposition} by author</strong><p>{review.response}</p></div> : null}
      </article>) : <p className={styles.empty}>No reviews yet.</p>}
      {!viewer ? <Link href={`/login?next=${encodeURIComponent(url)}`}>Sign in to review</Link> : owner ? <Link href={`/ideas/${revision.cardId}#reviews`}>Respond in your workspace</Link> : <ActionForm action={submitReview}>
        <input type="hidden" name="revisionId" value={revision.id} />
        <label>Component<select name="component" defaultValue="segment">{Object.entries(REVIEW_COMPONENTS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Review kind<select name="kind" defaultValue="challenge"><option value="challenge">Challenge a claim</option><option value="evidence">Add evidence</option><option value="test">Suggest a test</option><option value="help">Offer help</option></select></label>
        <label>Review<textarea name="text" rows={4} required maxLength={12000} /></label><SubmitButton><MessageSquare size={15} />Submit review</SubmitButton>
      </ActionForm>}
    </section>
  </article>;
}
