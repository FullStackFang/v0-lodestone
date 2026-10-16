/** Semantic Scholar by query: one page of paper search, for the DOIs and
 *  TLDRs it returns. A hit is resolved through OpenAlex (`fetchWork` →
 *  `ingestWork`) by the caller, so every document keeps one provenance shape;
 *  a paper with no DOI is skipped and counted. Data is ODC-BY: attribute
 *  Semantic Scholar where a TLDR is shown.
 *
 *  A 429 or a network failure is returned as `error`, never thrown: the
 *  caller records it and the next import retries. */
import { doiOf } from "./openalex";
import { s2Limiter, type Limiter } from "./rate";

const API = "https://api.semanticscholar.org/graph/v1/paper/search";
const FIELDS = "externalIds,title,year,tldr";

export function s2SearchUrl(query: string, limit: number): string {
  return `${API}?${new URLSearchParams({ query, limit: String(limit), fields: FIELDS })}`;
}

export interface S2Hit {
  /** Lower-cased bare DOI. */
  doi: string;
  tldr: string | null;
}

export interface S2Options {
  query: string;
  /** At most this many papers; 25 by default. */
  limit?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  wait?: Limiter;
}

export interface S2Result {
  hits: S2Hit[];
  skippedNoDoi: number;
  error?: string;
}

interface S2Paper {
  externalIds?: { DOI?: string | null } | null;
  tldr?: { text?: string | null } | null;
}

const defaultWait = s2Limiter();

export async function searchS2(options: S2Options): Promise<S2Result> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = options.apiKey ?? process.env.S2_API_KEY?.trim();
  const wait = options.wait ?? defaultWait;
  let data: S2Paper[];
  try {
    await wait();
    const response = await fetchImpl(s2SearchUrl(options.query, options.limit ?? 25), {
      headers: { accept: "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200);
      return { hits: [], skippedNoDoi: 0, error: `s2 ${response.status}: ${body}` };
    }
    data = ((await response.json()) as { data?: S2Paper[] }).data ?? [];
  } catch (error) {
    return { hits: [], skippedNoDoi: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const hits: S2Hit[] = [];
  let skippedNoDoi = 0;
  for (const paper of data) {
    const doi = paper.externalIds?.DOI ? doiOf(paper.externalIds.DOI) : null;
    if (!doi) {
      skippedNoDoi += 1;
      continue;
    }
    hits.push({ doi: doi.toLowerCase(), tldr: paper.tldr?.text ?? null });
  }
  return { hits, skippedNoDoi };
}
