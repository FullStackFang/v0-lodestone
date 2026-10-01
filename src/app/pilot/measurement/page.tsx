import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { measurementConsentFor } from "@/pilot/measurement";
import { PilotActionForm } from "../operator/PilotActionForm";
import { decideMeasurement, withdrawMeasurementConsent } from "./actions";

export const dynamic = "force-dynamic";

export default async function MeasurementPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const consent = await measurementConsentFor(db, person.id);
  return <div className="pilot-workspace">
    <header className="page-heading"><div><p className="eyebrow">Optional pilot measurement</p><h1>Your measurement choice</h1></div></header>
    <section className="card form-stack">
      <p>Joining measurement is optional and does not change your access to Thesis Forge. If you consent, the pilot records only whether you visibly used the signed-in workspace on a UTC day. It stores no page, click, device, idea, review, note, email, or contact content in activity records.</p>
      <p>Aggregate reports include eligible workflow counts and coarse return visits under notice <strong>measurement-v1</strong>. Reports exclude identities and free text. You may withdraw at any time; withdrawal deletes daily activity and excludes your records from later reports without deleting your product work.</p>
      <p>Current choice: <strong>{consent?.status ?? "not answered"}</strong></p>
      {consent?.status === "consented" ? <PilotActionForm action={withdrawMeasurementConsent}>
        <button className="button outline" type="submit">Withdraw measurement consent</button>
      </PilotActionForm> : <PilotActionForm action={decideMeasurement}>
        <button className="button" name="decision" value="yes" type="submit">I consent to measurement</button>
        <button className="button outline" name="decision" value="no" type="submit">I decline measurement</button>
      </PilotActionForm>}
    </section>
  </div>;
}
