import { Check, X } from "lucide-react";
import type { introductionsFor } from "@/harness/founder/intro";
import { respondToIntroduction } from "./actions";
import { ActionForm } from "./action-form";
import styles from "./me.module.css";

type Introduction = Awaited<ReturnType<typeof introductionsFor>>[number];

export function IntroductionStatus({ introduction }: { introduction: Introduction }) {
  const { row, mine, contact } = introduction;
  if (row.status === "accepted") return <div>
    <span className={styles.status}>Introduction accepted</span>
    {contact ? <a className={styles.contact} href={`mailto:${contact.email}`}>{contact.email}</a> : null}
  </div>;
  if (row.status === "declined") return <p>Introduction declined.</p>;
  if (mine) return <p>Request pending. Contact details remain private until accepted.</p>;
  return <div>
    <p>{introduction.otherName} requested a conversation. Accepting shares your email addresses with each other.</p>
    <ActionForm action={respondToIntroduction} success="Response recorded.">
      <input type="hidden" name="introductionId" value={row.id} />
      <button className={`button ${styles.command}`} name="decision" value="accepted"><Check size={16} aria-hidden="true" />Accept</button>
      <button className={`button outline ${styles.command}`} name="decision" value="declined"><X size={16} aria-hidden="true" />Decline</button>
    </ActionForm>
  </div>;
}
