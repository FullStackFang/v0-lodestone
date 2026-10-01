import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Bell, BookOpen, Check, CheckCheck, Plus, RefreshCw, Save, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { getDb } from "@/db/client";
import { session, thesisCard } from "@/db/schema";
import { requirePerson } from "@/lib/session";
import { isCuratorEmail, listResourcesForPerson } from "@/resources/service";
import { outcome, refresh, saveNeed } from "./actions";
import { ResourceForm } from "./ResourceForm";
import { membershipFor } from "@/pilot/membership";
import { listOwnerRefreshReceipts } from "@/resources/refresh-runs";
import { selectSuggestions } from "@/resources/suggestions";
import "./resources.css";

export const dynamic = "force-dynamic";

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ card?: string; all?: string; refresh?: string }> }) {
  const db = await getDb();
  const actor = await requirePerson(db);
  const params = await searchParams;
  const [view, cards, membership, receipts] = await Promise.all([
    listResourcesForPerson(db, actor.id),
    db.select({ id: thesisCard.id, title: thesisCard.ideaText }).from(thesisCard)
      .innerJoin(session, eq(session.id, thesisCard.sessionId)).where(eq(session.personId, actor.id)).orderBy(desc(thesisCard.createdAt)),
    membershipFor(db, actor.id),
    listOwnerRefreshReceipts(db, actor.id),
  ]);
  const active = membership?.status === "active" && !membership.revokedAt;
  const selectedCard = params.card ? cards.find(card => card.id === params.card) : undefined;
  if (params.card && !selectedCard) notFound();
  const needs = view.needs.filter(need => !selectedCard || need.cardId === selectedCard.id);
  const visible = selectSuggestions(view.recommendations, selectedCard?.id, params.all === "1");
  const allSuggestions = selectSuggestions(view.recommendations, selectedCard?.id, true);
  const unread = allSuggestions.filter(({ recommendation }) => !recommendation.readAt && !recommendation.outcome).length;
  return <div className="resource-workspace">
    <header className="resource-heading">
      <div><h1>{selectedCard ? "Research for your idea" : "Research and open needs"}</h1><p className="resource-count"><Bell size={16} /> {unread} unread</p></div>
      <nav><a href="/new">New idea</a><a href="/resources/catalog"><BookOpen size={16} /> Research collection</a>{active && isCuratorEmail(actor.email) && <a href="/resources/import"><Plus size={16} /> Add resource</a>}</nav>
      {active && <ResourceForm action={refresh} pendingMessage="Checking saved needs against the research collection…"><button className="button" type="submit"><RefreshCw size={16} /> Check for new research</button></ResourceForm>}
    </header>
    {selectedCard && <div className="research-context"><p className="muted">Your private idea</p><h2>{selectedCard.title || "Untitled idea"}</h2><a href={`/ideas/${selectedCard.id}`}>Open idea</a> · <a href="/resources">All saved needs</a></div>}
    {params.refresh === "failed" && <p className="notice" role="status">Your idea and need were saved. Research could not be checked on arrival; use Check for new research to retry.</p>}
    {!active && <p className="notice">Your pilot membership is inactive. Your saved needs and recommendation history remain available read-only.</p>}
    {receipts.length > 0 && <p className="muted">Latest refresh: {receipts[0].status} · {receipts[0].checked} needs checked{receipts[0].errorCode ? ` · ${receipts[0].errorCode}` : ""}</p>}

    <section className="resource-band" aria-labelledby="needs-title">
      <h2 id="needs-title">1. Your unresolved need</h2>
      {needs.map((need) => <article className="resource-need" key={need.id}>
        {active ? <ResourceForm action={saveNeed}>
          <input type="hidden" name="needId" value={need.id} />
          <label>Need<input key={need.title} name="title" type="text" maxLength={200} required defaultValue={need.title} /></label>
          <label>What would progress look like?<textarea key={need.criteria} name="criteria" maxLength={2000} required rows={2} defaultValue={need.criteria} /></label>
          <div className="resource-toolbar">
            <label>Status<select key={need.status} name="status" defaultValue={need.status}><option value="active">Active</option><option value="paused">Paused</option><option value="resolved">Resolved</option></select></label>
            <label className="resource-check"><input key={String(need.monitoring)} type="checkbox" name="monitoring" defaultChecked={need.monitoring} /> Monitor resources</label>
            <button className="button outline" type="submit"><Save size={16} /> Save</button>
            <a href={`/ideas/${need.cardId}`}>Idea</a>
          </div>
          <small>Last checked: {need.lastCheckedAt ? need.lastCheckedAt.toLocaleDateString("en-US") : "Never"}</small>
        </ResourceForm> : <div><h3>{need.title}</h3><p>{need.criteria}</p><small>{need.status} · Last checked: {need.lastCheckedAt ? need.lastCheckedAt.toLocaleDateString("en-US") : "Never"}</small></div>}
      </article>)}
      {active && <details className="resource-add" open={needs.length === 0}>
        <summary>Add a need</summary>
        {cards.length ? <ResourceForm action={saveNeed}>
          <label>Idea<select name="cardId" required defaultValue={cards.some((card) => card.id === params.card) ? params.card : cards[0].id}>{cards.map((card) => <option key={card.id} value={card.id}>{card.title?.slice(0, 100) || "Untitled idea"}</option>)}</select></label>
          <label>Need<input name="title" type="text" maxLength={200} required /></label>
          <label>What would progress look like?<textarea name="criteria" rows={3} maxLength={2000} required /></label>
          <label className="resource-check"><input type="checkbox" name="monitoring" defaultChecked /> Monitor resources</label>
          <button className="button" type="submit"><Plus size={16} /> Save need</button>
        </ResourceForm> : <p><a href="/new">Create an idea and save its first need</a></p>}
      </details>}
    </section>

    <section className="resource-band" aria-labelledby="recommendation-title">
      <h2 id="recommendation-title">2. Review research · 3. Choose your next move</h2>
      <p>Start with up to three suggestions per need. Shared words help surface sources; you decide whether the findings apply to your idea.</p>
      {visible.length === 0 && <p className="research-context">No matching suggestions are available for these needs yet. Your work is saved. Add specific terms to your need or check again when the research collection grows.</p>}
      {allSuggestions.length > visible.length && <a href={`/resources?${selectedCard ? `card=${selectedCard.id}&` : ""}all=1`}>Show all {allSuggestions.length} suggestions</a>}
      <div className="resource-results">{visible.map(({ recommendation, need, resource }) => <article className="resource-result" key={recommendation.id}>
        <div className="resource-toolbar"><span>{resource.kind.replaceAll("_", " ")}</span>{!recommendation.readAt && !recommendation.outcome && <strong className="resource-new">New</strong>}{recommendation.outcome && <span><Check size={14} /> {recommendation.outcome.replaceAll("_", " ")}</span>}</div>
        <h3><a href={`/resources/catalog#${resource.id}`}>{resource.title}</a></h3>
        <p><strong>Need:</strong> {need.title}</p>
        <p><strong>Why this appears:</strong> {recommendation.explanation.explanation}</p>
        <h4>What the source says</h4>
        {recommendation.explanation.snippets.map((claim, index) => <blockquote key={index}>{claim.quote}</blockquote>)}
        {resource.proposals.length > 0 && <div><h4>Possible applications to consider</h4><p className="muted">Curator proposals; these outcomes have not been demonstrated for your idea.</p><ul>{resource.proposals.map((proposal, index) => <li key={index}>{proposal}</li>)}</ul></div>}
        <dl><dt>Applicability</dt><dd>{recommendation.explanation.applicability.join("; ")}</dd><dt>Limitations</dt><dd>{recommendation.explanation.limitations.join("; ")}</dd><dt>Next Step</dt><dd>{recommendation.explanation.nextAction}</dd></dl>
        <a href={resource.sourceUrl} target="_blank" rel="noreferrer">Source: {resource.identifier}</a><span> ({resource.sourceDate})</span>
        {active && <ResourceForm action={outcome}>
          <input type="hidden" name="recommendationId" value={recommendation.id} />
          <label>My next action or reason<textarea key={recommendation.outcomeNote ?? ""} name="note" rows={2} maxLength={2000} defaultValue={recommendation.outcomeNote ?? ""} placeholder="For example: ask the organizer whether mutual follow-up would help newcomers." /></label>
          <small>To mark this as helped, record what you will do next.</small>
          <div className="resource-toolbar">
            <button type="submit" name="outcome" value="read" className="button outline" title="Mark as read" aria-label="Mark as read"><CheckCheck size={16} /></button>
            <button type="submit" name="outcome" value="helped" className="button outline"><ThumbsUp size={16} /> Helped</button>
            <button type="submit" name="outcome" value="not_helpful" className="button outline"><ThumbsDown size={16} /> Not helpful</button>
            <button type="submit" name="outcome" value="dismissed" className="button outline" title="Dismiss" aria-label="Dismiss"><X size={16} /></button>
          </div>
        </ResourceForm>}
      </article>)}</div>
    </section>
  </div>;
}
