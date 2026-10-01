import type { ReactNode } from "react";
import { RUBRIC_FACTORS, type CardFields } from "@/schema/card";
import styles from "./workspace.module.css";

export const EVIDENCE_LABELS = { observed_behavior: "Observed behavior", incurred_cost: "Incurred cost", stated_opinion: "Stated opinion", model_inference: "Model inference" } as const;
const words = (s: string) => s.replaceAll("_", " ");

function Entry({ label, value }: { label: string; value: string | null | undefined }) {
  return <><dt>{label}</dt><dd>{value || <span className={styles.empty}>Not stated</span>}</dd></>;
}
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className={styles.band} id={id}><h2>{title}</h2>{children}</section>;
}

export function ThesisSheet({ fields: f }: { fields: CardFields }) {
  return <>
    <Section id="offering" title="Thesis"><dl className={styles.definition}>
      <Entry label="Offering" value={f.offering} />
      <Entry label="Customer" value={f.segment?.description} />
      <Entry label="Value" value={f.value_proposition} />
    </dl></Section>
    <Section id="segment" title="Customer segment"><dl className={styles.definition}>
      <Entry label="Findable through" value={f.segment?.findability_evidence} />
      <Entry label="Shared need" value={f.segment?.homogeneity_claim} />
      <Entry label="Size and basis" value={f.segment?.size_estimate} />
      <Entry label="Segment checks" value={f.segment?.four_question_test ? Object.entries(f.segment.four_question_test).map(([k,v]) => `${words(k)}: ${v}`).join("\n") : null} />
      <Entry label="Refinement" value={f.segment?.refinement} />
    </dl></Section>
    <Section id="value_proposition" title="Customer value"><dl className={styles.definition}><Entry label="Value proposition" value={f.value_proposition} /></dl></Section>
    <Section id="jtbd" title="Job to be done"><dl className={styles.definition}>
      <Entry label="Job" value={f.jtbd?.job_statement} /><Entry label="Functional" value={f.jtbd?.functional} />
      <Entry label="Emotional" value={f.jtbd?.emotional} /><Entry label="Social" value={f.jtbd?.social} />
      <Entry label="Workaround today" value={f.jtbd?.current_workaround} />
      <Entry label="Member test" value={f.jtbd?.passes_member_test == null ? null : f.jtbd.passes_member_test ? "Author says yes" : "Author says no"} />
    </dl></Section>
    <Section id="economic_buyer" title="Economic buyer"><dl className={styles.definition}>
      <Entry label="Who pays" value={f.economic_buyer?.role} />
      <Entry label="Relationship" value={f.economic_buyer?.distinct_from_end_user == null ? null : f.economic_buyer.distinct_from_end_user ? "Different from the end user" : "The end user"} />
      <Entry label="Budget evidence" value={f.economic_buyer?.budget_evidence} />
    </dl></Section>
    <Section id="beachhead" title="Beachhead market"><dl className={styles.definition}>
      <Entry label="First market" value={f.beachhead?.market} /><Entry label="Why first" value={f.beachhead?.why_first} />
      <Entry label="Adjacent markets" value={f.beachhead?.adjacent_markets.join("\n")} />
    </dl></Section>
    <Section id="four_us" title="Problem urgency"><dl className={styles.definition}>
      {(["unworkable", "unavoidable", "urgent", "underserved"] as const).map((k) => <Entry key={k} label={words(k)} value={f.four_us?.[k] ? `${f.four_us[k].answer == null ? "Unknown" : f.four_us[k].answer ? "Yes" : "No"}${f.four_us[k].rationale ? `. ${f.four_us[k].rationale}` : ""}` : null} />)}
    </dl></Section>
    <Section id="rubric_scores" title="Assessment">
      {f.rubric_scores ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Factor</th><th>Score</th><th>Rationale and basis</th></tr></thead><tbody>
        {RUBRIC_FACTORS.map((k) => { const r = f.rubric_scores![k]; return <tr key={k}><td>{words(k)}</td><td>{r.score}/5</td><td>{r.rationale}<div className={styles.meta}>{EVIDENCE_LABELS[r.evidence_type]} · {r.confidence} confidence</div></td></tr>; })}
      </tbody></table></div> : <p className={styles.empty}>Not assessed</p>}
    </Section>
    <Section id="kill_assumption" title="Critical assumption"><dl className={styles.definition}>
      <Entry label="Assumption" value={f.kill_assumption?.assumption} /><Entry label="Cheapest test" value={f.kill_assumption?.cheapest_test?.description} />
      <Entry label="Falsifiable" value={f.kill_assumption?.falsifiable == null ? null : f.kill_assumption.falsifiable ? "Author says yes" : "Author says no"} />
      <Entry label="Time needed" value={f.kill_assumption?.cheapest_test?.days == null ? null : `${f.kill_assumption.cheapest_test.days} days`} />
      <Entry label="Invalidated if" value={f.kill_assumption?.cheapest_test?.kill_criterion} />
    </dl></Section>
    <Section id="facets" title="Business model"><dl className={styles.definition}>
      <Entry label="Summary" value={f.facets?.one_liner} />
      <Entry label="Offering type" value={f.facets?.offering_type ? words(f.facets.offering_type) : null} />
      <Entry label="Revenue model" value={f.facets?.business_model ? words(f.facets.business_model) : null} />
      <Entry label="Industry" value={f.facets?.segment.industry} /><Entry label="Geography" value={f.facets?.segment.geography} />
      <Entry label="Industry group" value={f.facets?.segment.industry_group ? words(f.facets.segment.industry_group) : null} />
      <Entry label="Buyer role" value={f.facets?.segment.buyer_role ? words(f.facets.segment.buyer_role) : null} />
      <Entry label="Organization size" value={f.facets?.segment.org_size ? words(f.facets.segment.org_size) : null} />
      <Entry label="Job taxonomy" value={f.facets?.jtbd ? [f.facets.jtbd.verb, f.facets.jtbd.object, f.facets.jtbd.context].filter(Boolean).join(" / ") : null} />
      <Entry label="Value category" value={f.facets?.quadrant ? words(f.facets.quadrant) : null} />
      <Entry label="Keywords" value={f.facets?.keywords.join(", ")} />
    </dl></Section>
    <Section id="evidence" title="Recorded evidence">
      {f.evidence?.length ? <ul className={styles.list}>{f.evidence.map((e, i) => <li key={i}><p>{e.text}</p><p className={styles.meta}>{EVIDENCE_LABELS[e.evidence_type]}{e.date ? ` · ${e.date}` : ""}</p></li>)}</ul> : <p className={styles.empty}>No experiment results published.</p>}
    </Section>
  </>;
}
