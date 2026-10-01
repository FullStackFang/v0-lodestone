import Link from "next/link";
import { RefreshCw, UserPlus, X } from "lucide-react";
import { getDb } from "@/db/client";
import { markShown, matchesFor } from "@/harness/founder/me";
import { preferencesFor } from "@/harness/founder/preferences";
import { requirePerson } from "@/lib/session";
import { dismissMatch, refreshMatches, requestConversation } from "../actions";
import { ActionForm } from "../action-form";
import { IntroductionStatus } from "../introduction-status";
import styles from "../me.module.css";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const preferences = await preferencesFor(db, person.id);
  const matches = await matchesFor(db, person.id);
  await markShown(db, matches.map((m) => m.row.id));
  return <>
    <header className={styles.header}><h1>Proposed connections</h1><Link href="/me">My profile</Link></header>
    <p>Conversation suggestions based on stated interests and capabilities. Founder fit has not been validated.</p>
    {!preferences.discoverable || preferences.availability === "unavailable" ?
      <p>Discovery is paused. <Link href="/me">Review your discovery preferences</Link>.</p> : <>
        <ActionForm action={refreshMatches} success="Connections refreshed.">
          <button className={`button outline ${styles.command}`}><RefreshCw size={16} aria-hidden="true" />Refresh connections</button>
        </ActionForm>
        {!matches.length ? <p>No current connections meet your preferences. Your profile and shared ideas remain available for future matches.</p> : null}
      </>}
    {matches.map((match) => <article className={styles.match} key={match.row.id}>
      <h2>{match.name}</h2>
      <p className={styles.meta}>{match.preferences.availability.replace("_", " ")} | Seeking a {match.preferences.intent}</p>
      <h3>Capabilities that may address your stated needs</h3>
      {match.rationale.complementary.length ? <ul>{match.rationale.complementary.map((pair, i) =>
        <li key={i}><strong>They bring:</strong> {pair.capability}<br /><strong>You seek:</strong> {pair.need}</li>)}</ul> :
        <p>No direct capability-to-need pairing on the current record.</p>}
      <h3>Shared idea interests</h3>
      {match.rationale.sharedIdeas.length ? <ul>{match.rationale.sharedIdeas.map((pair, i) =>
        <li key={i}><strong>Their idea:</strong> {pair.theirs}<br /><strong>Your idea:</strong> {pair.yours}</li>)}</ul> :
        <p>No shared idea comparison on the current record.</p>}
      {match.introduction ? <IntroductionStatus introduction={match.introduction} /> : <div className={styles.actions}>
        <ActionForm action={requestConversation} success="Request sent. Waiting for their response.">
          <input type="hidden" name="matchResultId" value={match.row.id} />
          <button className={`button ${styles.command}`}><UserPlus size={16} aria-hidden="true" />Request a conversation</button>
        </ActionForm>
        <ActionForm action={dismissMatch} success="Connection dismissed.">
          <input type="hidden" name="matchResultId" value={match.row.id} />
          <button className={`button outline ${styles.command}`}><X size={16} aria-hidden="true" />Dismiss</button>
        </ActionForm>
      </div>}
    </article>)}
  </>;
}
