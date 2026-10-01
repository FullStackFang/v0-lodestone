/** One text, one sitting.
 *
 * The session is created here, on open, with the mode the link carried —
 * `casual` unless the list said otherwise. Mode is a promise made at the
 * start; nothing on this page can change it afterwards, and nothing
 * anywhere infers it from how long the reader stayed. */
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { openReading, readingView } from "@/harness/papers/reading";
import { ReadingMode } from "@/harness/schema";
import { Followups } from "./Followups";
import { Reader } from "./Reader";
import "../../harness/harness.css";

export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ artifactId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { artifactId } = await params;
  const query = await searchParams;
  const db = await getDb();
  await requireCurator(db);

  const view = await readingView(db, artifactId);
  if (!view) notFound();

  const mode = ReadingMode.catch("casual").parse(
    Array.isArray(query.mode) ? query.mode[0] : query.mode,
  );
  const sessionId = await openReading(db, artifactId, mode);

  return (
    <>
      <div className="section">
        <span className="num">§ Harness · {mode === "exhaustive" ? "Exhaustive reading" : "Reading"}</span>
        <h1>{view.title}</h1>
      </div>

      <Followups sessionId={sessionId} />

      <Reader
        artifactId={artifactId}
        sessionId={sessionId}
        mode={mode}
        title={view.title}
        canonicalText={view.canonicalText}
        initial={view.annotations.map((a) => ({
          id: a.id,
          start: a.startOff,
          end: a.endOff,
          tag: a.tag,
          subtype: a.mechanismSubtype,
          note: a.note,
          assertionId: a.assertionId,
        }))}
      />

      <p className="notice">
        <a href="/harness">Back to the list</a>
      </p>
    </>
  );
}
