import { Plus } from "lucide-react";
import { requireCurator } from "@/resources/curator";
import { CLAIM_FACETS } from "@/resources/validation";
import { ResourceForm } from "../ResourceForm";
import { curate } from "../actions";
import "../resources.css";

export const dynamic = "force-dynamic";
export default async function ImportResourcePage() {
  await requireCurator();
  return <div className="resource-workspace"><a href="/resources">Resource Watch</a><h1>Add Resource</h1>
    <ResourceForm action={curate} className="resource-import">
      <label>Source type<select name="kind"><option value="paper">Research paper</option><option value="patent">Patent</option><option value="technology_disclosure">Technology disclosure</option></select></label>
      <label>Title<input name="title" type="text" required maxLength={300} /></label>
      <label>Source URL<input name="sourceUrl" type="url" required maxLength={2000} /></label>
      <div className="resource-columns"><label>Identifier<input name="identifier" type="text" required maxLength={300} /></label><label>Source date<input name="sourceDate" type="date" required /></label></div>
      <label>Source text<textarea name="rawText" rows={10} maxLength={60000} required /></label>
      <div className="resource-columns">{CLAIM_FACETS.map((facet) => <div key={facet}>
        <label>{facet === "access" ? "Access and availability" : facet[0].toUpperCase() + facet.slice(1)} quote<textarea name={facet} rows={3} maxLength={1500} /></label>
        <label>Preceding text (optional)<input type="text" name={`${facet}Prefix`} maxLength={200} /></label>
      </div>)}</div>
      <label>Hypotheses (not source claims)<textarea name="proposals" rows={3} maxLength={10000} /></label>
      <button type="submit" className="button"><Plus size={16} /> Add resource</button>
    </ResourceForm>
  </div>;
}
