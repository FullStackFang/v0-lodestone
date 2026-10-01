import Link from "next/link";
import { Check, Plus, Trash2 } from "lucide-react";
import type { AssertionRow } from "@/db/schema";
import { inventory, stated, type MeView } from "@/harness/founder/me";
import { addCommanded, addSought, answerFollowUp, editAssertion, removeAssertion, updateMatchingPreferences } from "./actions";
import { ActionForm } from "./action-form";
import { IntroductionStatus } from "./introduction-status";
import styles from "./me.module.css";

export function ProfileRow({ row }: { row: AssertionRow }) {
  return <li className={styles.row}>
    <p>{row.text}</p>
    <span className={styles.meta}>{row.confidence === "confirmed" ? "Confirmed by you" : "Awaiting your confirmation"}</span>
    {row.subjectType === "person" ? <div className={styles.rowActions}>
      <ActionForm action={editAssertion}>
        <input type="hidden" name="id" value={row.id} />
        <input type="text" name="text" defaultValue={row.text} required maxLength={2000} aria-label="Profile fact" />
        <button className={styles.iconButton} title="Save profile fact" aria-label="Save profile fact"><Check size={16} /></button>
      </ActionForm>
      <ActionForm action={removeAssertion} success="Removed from your current profile.">
        <input type="hidden" name="id" value={row.id} />
        <button className={styles.iconButton} title="Remove profile fact" aria-label="Remove profile fact"><Trash2 size={16} /></button>
      </ActionForm>
    </div> : <p><Link href={`/ideas/${row.subjectId}`}>Edit this idea</Link></p>}
  </li>;
}

export function ProfileContent({ view }: { view: MeView }) {
  const bins = inventory(view);
  return <>
    <header className={styles.header}><h1>{view.name}</h1><Link href="/me/matches">Proposed connections</Link></header>
    <section className={styles.section}>
      <h2>Discovery</h2>
      <ActionForm action={updateMatchingPreferences} success="Discovery preferences saved.">
        <div className={styles.preferences}>
          <label className={styles.consent}><input key={String(view.preferences.discoverable)} type="checkbox" name="discoverable" defaultChecked={view.preferences.discoverable} />
            <span>Make my profile discoverable to classmates. Share my profile facts and cohort-published ideas for matching; keep my email private until both people agree to an introduction.</span></label>
          <label>Availability<select key={view.preferences.availability} name="availability" defaultValue={view.preferences.availability}>
            <option value="unavailable">Not available</option><option value="exploring">Exploring</option>
            <option value="part_time">Part time</option><option value="full_time">Full time</option>
          </select></label>
          <label>Looking for<select key={view.preferences.intent} name="intent" defaultValue={view.preferences.intent}>
            <option value="cofounder">A cofounder</option><option value="collaborator">A collaborator</option>
          </select></label>
          <button className={`button ${styles.command}`}><Check size={16} aria-hidden="true" />Save preferences</button>
        </div>
      </ActionForm>
    </section>
    <div className={styles.grid}>
      <section className={styles.section}><h2>Capabilities I bring</h2>
        <ul className={styles.list}>{stated(bins.commanded).map((row) => <ProfileRow key={row.id} row={row} />)}</ul>
        {!stated(bins.commanded).length ? <p>No capabilities stated yet.</p> : null}
        <ActionForm action={addCommanded} success="Capability added.">
          <input type="text" name="text" required maxLength={2000} aria-label="Capability I bring" placeholder="Customer discovery in medical devices" />
          <button className={styles.iconButton} aria-label="Add capability" title="Add capability"><Plus size={16} /></button>
        </ActionForm>
      </section>
      <section className={styles.section}><h2>Capabilities I am seeking</h2>
        <ul className={styles.list}>{stated(bins.sought).map((row) => <ProfileRow key={row.id} row={row} />)}</ul>
        {!stated(bins.sought).length ? <p>No needs stated yet.</p> : null}
        <ActionForm action={addSought} success="Need added.">
          <input type="text" name="text" required maxLength={2000} aria-label="Capability I am seeking" placeholder="Distribution in dental supply" />
          <button className={styles.iconButton} aria-label="Add need" title="Add need"><Plus size={16} /></button>
        </ActionForm>
      </section>
    </div>
    <section className={styles.section}><h2>Experience and other profile facts</h2>
      <ul className={styles.list}>{stated(view.rows).filter((r) => r.subjectType === "person" && !["mechanism_commanded", "mechanism_sought"].includes(r.facet ?? ""))
        .map((row) => <ProfileRow key={row.id} row={row} />)}</ul>
    </section>
    <section className={styles.section}><h2>Idea records</h2>
      <ul className={styles.list}>{stated(bins.purposes).map((row) => <ProfileRow key={row.id} row={row} />)}</ul>
      {!stated(bins.purposes).length ? <p>No idea records yet. <Link href="/ideas">Open your ideas</Link>.</p> : null}
    </section>
    <section className={styles.section}><h2>Matching record</h2>
      {!view.preferences.discoverable ? <p>Your profile is private.</p> : <ul className={styles.list}>
        {view.sharedRows.map((row) => <li className={styles.row} key={row.id}>{row.text}</li>)}
      </ul>}
    </section>
    <section className={styles.section}><h2>Introductions</h2>
      {!view.introductions.length ? <p>No introductions yet.</p> : <ul className={styles.list}>
        {view.introductions.map((introduction) => <li className={styles.row} key={introduction.row.id}>
          <strong>{introduction.otherName}</strong><IntroductionStatus introduction={introduction} />
        </li>)}
      </ul>}
      {view.followUps.map((followUp) => <div className={styles.row} key={followUp.judgment.id}>
        <p>Did the conversation with {followUp.otherName ?? "your connection"} help?</p>
        <ActionForm action={answerFollowUp} success="Feedback recorded.">
          <input type="hidden" name="matchResultId" value={followUp.judgment.matchResultId} />
          <button className="button" name="verdict" value="helped">Yes</button>
          <button className="button outline" name="verdict" value="not_helpful">No</button>
        </ActionForm>
      </div>)}
    </section>
  </>;
}
