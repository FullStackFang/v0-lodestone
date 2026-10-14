/** OpenAlex by query: `/works?search=…` paged by cursor, filtered to works
 *  that carry an abstract.
 *
 *  Nothing is buffered. Each page's works are handed to `onWork` before the
 *  next page is asked for, so a run that dies after page three has written
 *  three pages. A 429 or a network failure is a resume point, not an error:
 *  the loop returns the cursor of the page it could not read and the caller
 *  prints it for `--cursor`. */
import type { OpenAlexWork } from "./openalex";
import { limiter, OPENALEX_PER_SECOND, type Limiter } from "./rate";

const API = "https://api.openalex.org/works";
/** OpenAlex's largest page. */
const PER_PAGE = 200;

export interface SearchUrlInput {
  query: string;
  since?: number | null;
  cursor: string;
  perPage: number;
  mailto?: string;
  apiKey?: string;
}

export function searchUrl({ query, since, cursor, perPage, mailto, apiKey }: SearchUrlInput): string {
  const filter = ["has_abstract:true", ...(since ? [`from_publication_date:${since}-01-01`] : [])].join(",");
  const params = new URLSearchParams({ search: query, filter, "per-page": String(perPage), cursor });
  if (mailto) params.set("mailto", mailto);
  if (apiKey) params.set("api_key", apiKey);
  return `${API}?${params}`;
}

export interface SearchOptions {
  query: string;
  /** Earliest publication year. */
  since?: number | null;
  /** Stop after this many works. */
  limit?: number;
  /** Resume from a printed cursor; `*` starts at the top. */
  cursor?: string | null;
  mailto?: string;
  /** OpenAlex wants a free key to page past the first page by cursor. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  wait?: Limiter;
  /** Called once per page read, with the cursor that read it. */
  onPage?: (page: { cursor: string; works: number }) => void;
}

export interface SearchResult {
  seen: number;
  /** True when a page could not be read; `cursor` resumes at that page. */
  stopped: boolean;
  /** Where to resume, or null when the results ran out. */
  cursor: string | null;
  reason?: string;
}

interface WorksPage {
  results?: OpenAlexWork[];
  meta?: { next_cursor?: string | null };
}

export async function searchWorks(
  options: SearchOptions,
  onWork: (work: OpenAlexWork) => Promise<void>,
): Promise<SearchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? limiter(OPENALEX_PER_SECOND, 1000);
  const mailto = options.mailto ?? process.env.OPENALEX_MAILTO?.trim();
  const apiKey = options.apiKey ?? process.env.OPENALEX_API_KEY?.trim();
  const limit = options.limit ?? Infinity;
  let cursor: string | null = options.cursor || "*";
  let seen = 0;

  while (cursor !== null && seen < limit) {
    const perPage = Math.min(PER_PAGE, limit - seen);
    let page: WorksPage;
    try {
      await wait();
      const response = await fetchImpl(searchUrl({ query: options.query, since: options.since, cursor, perPage, mailto, apiKey }), {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        return { seen, stopped: true, cursor, reason: `openalex ${response.status}: ${body}` };
      }
      page = (await response.json()) as WorksPage;
    } catch (error) {
      return { seen, stopped: true, cursor, reason: error instanceof Error ? error.message : String(error) };
    }

    const works = (page.results ?? []).slice(0, perPage);
    options.onPage?.({ cursor, works: works.length });
    for (const work of works) {
      await onWork(work);
      seen += 1;
    }
    cursor = works.length === 0 ? null : page.meta?.next_cursor ?? null;
  }
  return { seen, stopped: false, cursor };
}
