/** PatentsView, the source of a patent: granted US patents from the
 *  PatentSearch API, by query and grant date.
 *
 *  A patent is the same shape as a paper for everything Lodestone does — a
 *  title, an abstract, provenance, one vector — so it is written the same
 *  way: a `document` with `source = 'patent'` and an `artifact_texts` row
 *  with `source_format = 'abstract'`. `ingestPatent` mirrors `ingestWork`.
 *
 *  The API needs a free key in `X-Api-Key` and allows 45 requests a minute.
 *  USPTO paused it on 2026-03-20 while moving PatentsView into its Open Data
 *  Portal; until it answers again, a run stops on the first request with the
 *  failure printed, and this file is the one to repoint. */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { hashText, normalize, putArtifactText } from "../canonical";
import { storedBySourceId, wordCount, type IngestStatus } from "./ingest";
import { limiter, PATENTSVIEW_PER_MINUTE, type Limiter } from "./rate";
import type { SearchResult } from "./search";

const API = "https://search.patentsview.org/api/v1/patent/";
/** PatentSearch's largest page. */
const PER_PAGE = 1000;
export const PATENT_PARSER = "patentsview-abstract-v1";

/** Only the fields ingest reads; `FIELDS` asks for exactly these. */
export interface PatentsViewPatent {
  patent_id?: string | null;
  patent_title?: string | null;
  patent_abstract?: string | null;
  patent_date?: string | null;
  assignees?: ({ assignee_organization?: string | null } | null)[] | null;
  inventors?: ({ inventor_name_first?: string | null; inventor_name_last?: string | null } | null)[] | null;
  cpc_current?: ({ cpc_section_id?: string | null; cpc_group_id?: string | null } | null)[] | null;
}

const FIELDS = [
  "patent_id",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "assignees.assignee_organization",
  "inventors.inventor_name_first",
  "inventors.inventor_name_last",
  "cpc_current.cpc_section_id",
  "cpc_current.cpc_group_id",
];

/** The eight CPC sections and the tagging section, so a patent's `field`
 *  reads like OpenAlex's `primary_topic.field` on a paper. */
const CPC_SECTIONS: Record<string, string> = {
  A: "Human necessities",
  B: "Performing operations; transporting",
  C: "Chemistry; metallurgy",
  D: "Textiles; paper",
  E: "Fixed constructions",
  F: "Mechanical engineering; lighting; heating; weapons; blasting",
  G: "Physics",
  H: "Electricity",
  Y: "General tagging of new technological developments",
};

export function fieldOfCpc(section: string | null | undefined): string | null {
  const name = section ? CPC_SECTIONS[section.toUpperCase()] : undefined;
  return name ? `${section!.toUpperCase()} — ${name}` : null;
}

/** The number PatentsView keys a patent by, from the forms a person pastes:
 *  `US11223344B2`, `US 11,223,344`, `D912345`. */
export function patentNumberOf(identifier: string): string {
  return identifier
    .trim()
    .toUpperCase()
    .replace(/^US/, "")
    .replace(/[\s,]/g, "")
    .replace(/[A-Z]\d$/, "");
}

export interface PatentProvenance extends Record<string, unknown> {
  patent_number: string | null;
  url: string | null;
  assignees: string[];
  inventors: string[];
  cpc: string[];
  year: number | null;
  field: string | null;
}

export function provenanceOfPatent(patent: PatentsViewPatent): PatentProvenance {
  const number = patent.patent_id ? patentNumberOf(patent.patent_id) : null;
  const year = patent.patent_date ? Number(patent.patent_date.slice(0, 4)) : NaN;
  const present = (s: string | null | undefined): s is string => typeof s === "string" && s.length > 0;
  return {
    patent_number: number,
    url: number ? `https://patents.google.com/patent/US${number}` : null,
    assignees: (patent.assignees ?? []).map((a) => a?.assignee_organization).filter(present),
    inventors: (patent.inventors ?? [])
      .map((i) => [i?.inventor_name_first, i?.inventor_name_last].filter(present).join(" "))
      .filter(present),
    cpc: [...new Set((patent.cpc_current ?? []).map((c) => c?.cpc_group_id).filter(present))],
    year: Number.isInteger(year) ? year : null,
    // The first CPC listed is the primary classification.
    field: fieldOfCpc(patent.cpc_current?.[0]?.cpc_section_id),
  };
}

/** Every word of the query in the title or the abstract, granted since a year. */
export function patentQuery({ query, since }: { query: string; since?: number | null }): Record<string, unknown> {
  const text = { _or: [{ _text_all: { patent_title: query } }, { _text_all: { patent_abstract: query } }] };
  return since ? { _and: [{ _gte: { patent_date: `${since}-01-01` } }, text] } : text;
}

interface PatentsPage {
  patents?: PatentsViewPatent[] | null;
}

async function post(
  body: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; patents: PatentsViewPatent[] } | { ok: false; reason: string }> {
  const response = await fetchImpl(API, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, reason: `patentsview ${response.status}: ${(await response.text()).slice(0, 200)}` };
  return { ok: true, patents: ((await response.json()) as PatentsPage).patents ?? [] };
}

function keyOf(apiKey: string | undefined): string {
  const key = apiKey ?? process.env.PATENTSVIEW_API_KEY?.trim();
  if (!key) throw new Error("PATENTSVIEW_API_KEY is not set: PatentsView answers no request without a key.");
  return key;
}

export interface PatentSearchOptions {
  query: string;
  /** Earliest grant year. */
  since?: number | null;
  limit?: number;
  /** The last patent number of the page before; null starts at the top. */
  cursor?: string | null;
  apiKey?: string;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  wait?: Limiter;
  onPage?: (page: { cursor: string; works: number }) => void;
}

/** The PatentsView twin of `searchWorks`: pages by `after` on a stable sort,
 *  hands each patent to `onPatent` before asking for the next page, and
 *  stops on any failure with the cursor that would retry it. */
export async function searchPatents(
  options: PatentSearchOptions,
  onPatent: (patent: PatentsViewPatent) => Promise<void>,
): Promise<SearchResult> {
  const apiKey = keyOf(options.apiKey);
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? limiter(PATENTSVIEW_PER_MINUTE, 60_000);
  const limit = options.limit ?? Infinity;
  const pageSize = options.pageSize ?? PER_PAGE;
  let after = options.cursor || null;
  let seen = 0;

  while (seen < limit) {
    const size = Math.min(pageSize, limit - seen);
    let page;
    try {
      await wait();
      page = await post(
        { q: patentQuery(options), f: FIELDS, s: [{ patent_id: "asc" }], o: after ? { size, after } : { size } },
        apiKey,
        fetchImpl,
      );
    } catch (error) {
      return { seen, stopped: true, cursor: after, reason: error instanceof Error ? error.message : String(error) };
    }
    if (!page.ok) return { seen, stopped: true, cursor: after, reason: page.reason };

    const patents = page.patents.slice(0, size);
    options.onPage?.({ cursor: after ?? "start", works: patents.length });
    for (const patent of patents) {
      await onPatent(patent);
      seen += 1;
    }
    const last = patents.at(-1)?.patent_id;
    if (patents.length < size || !last) return { seen, stopped: false, cursor: null };
    after = last;
  }
  return { seen, stopped: false, cursor: after };
}

/** One patent by number, or null when PatentsView holds none. Any failure
 *  throws — a rate limit is not a missing patent. */
export async function fetchPatent(number: string, apiKey?: string, fetchImpl: typeof fetch = fetch): Promise<PatentsViewPatent | null> {
  const page = await post({ q: { patent_id: patentNumberOf(number) }, f: FIELDS, o: { size: 1 } }, keyOf(apiKey), fetchImpl);
  if (!page.ok) throw new Error(page.reason);
  return page.patents[0] ?? null;
}

export interface PatentIngestResult {
  identifier: string;
  status: IngestStatus;
  artifactId?: string;
  textHash?: string;
  created?: boolean;
  sharedWith?: string;
  title?: string | null;
  provenance?: PatentProvenance;
}

export interface PatentIngestDeps {
  fetchPatent?: (number: string) => Promise<PatentsViewPatent | null>;
  /** Merged into the stored provenance — the query set a patent came from. */
  provenance?: Record<string, unknown>;
  /** As in `IngestDeps`: refuse a shorter abstract as `short_abstract`. */
  minWords?: number;
}

/** Fetch a patent, and write the `document` + `artifact_texts` pair. A
 *  number already stored is answered from its row before any request; a
 *  patent without an abstract is `no_abstract` and writes nothing. */
export async function ingestPatent(db: Db, identifier: string, deps: PatentIngestDeps = {}): Promise<PatentIngestResult> {
  const held = await storedBySourceId(db, { patent_number: patentNumberOf(identifier) });
  if (held) return { identifier, status: "ok", ...held, created: false };

  const fetcher = deps.fetchPatent ?? ((n: string) => fetchPatent(n));
  const patent = await fetcher(identifier);
  if (!patent) return { identifier, status: "not_found" };

  const title = patent.patent_title ?? null;
  const provenance: PatentProvenance = { ...provenanceOfPatent(patent), ...deps.provenance };
  const known = await storedBySourceId(db, provenance);
  if (known) return { identifier, status: "ok", ...known, created: false, title, provenance };

  const abstract = patent.patent_abstract ? normalize(patent.patent_abstract) : "";
  if (!abstract) return { identifier, status: "no_abstract" };
  if (wordCount(abstract) < (deps.minWords ?? 0)) return { identifier, status: "short_abstract", title, provenance };

  // Before the document row, as in `ingestWork`: a text already held means
  // this abstract has an artifact, and a second document would be an orphan.
  const textHash = hashText(abstract);
  const [shared] = await db
    .select({ artifactId: artifactTexts.artifactId })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);
  if (shared) return { identifier, status: "ok", artifactId: shared.artifactId, textHash, created: false, sharedWith: shared.artifactId, title, provenance };

  // One transaction, as in `ingestWork`: a refused text leaves no document.
  const { row, put } = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(document)
      .values({ sessionId: null, source: "patent", title, text: null })
      .returning({ id: document.id });
    return { row, put: await putArtifactText(tx, { artifactId: row.id, sourceFormat: "abstract", parser: PATENT_PARSER, text: abstract, provenance }) };
  });
  return { identifier, status: "ok", artifactId: row.id, textHash: put.textHash, created: put.created, sharedWith: put.sharedWith, title, provenance };
}
