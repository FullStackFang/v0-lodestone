/** OpenAlex, the only source of a paper.
 *
 * DOI-native, and its abstract is an inverted index that rebuilds
 * deterministically — which is why it is here and Semantic Scholar is not.
 * Every request carries `OPENALEX_API_KEY` when it is set: a key gets its
 * own daily budget, and without one a request draws on a shared keyless
 * budget. `OPENALEX_MAILTO` rides beside it as a contact address.
 *
 * Nothing in this module touches the database. It fetches, rebuilds and
 * reads fields; `ingest.ts` decides what becomes a row. */

const API = "https://api.openalex.org/works/";

export interface InvertedIndex {
  [word: string]: number[];
}

/** Only the fields ingest reads. OpenAlex returns far more. */
export interface OpenAlexWork {
  id?: string | null;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  abstract_inverted_index?: InvertedIndex | null;
  primary_topic?: { field?: { display_name?: string | null } | null } | null;
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  authorships?: ({ author?: { display_name?: string | null } | null } | null)[] | null;
}

/** The work whose id this is, or null for a 404. Any other failure throws —
 *  a rate limit is not a missing paper and the batch should say so. */
export async function fetchWork(
  identifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenAlexWork | null> {
  const response = await fetchImpl(workUrl(identifier), {
    headers: { accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`openalex ${response.status} for ${identifier}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as OpenAlexWork;
}

/** A DOI (bare, `doi:` or a doi.org URL), an OpenAlex `W…` id, or an
 *  OpenAlex URL. Anything else is a caller error, not a fetch. Carries the
 *  key and the contact address, read from the environment unless given. */
export function workUrl(
  identifier: string,
  { mailto = process.env.OPENALEX_MAILTO?.trim(), apiKey = process.env.OPENALEX_API_KEY?.trim() }: { mailto?: string; apiKey?: string } = {},
): string {
  const id = identifier.trim();
  const params = new URLSearchParams();
  if (mailto) params.set("mailto", mailto);
  if (apiKey) params.set("api_key", apiKey);
  const query = params.size ? `?${params}` : "";
  const doi = doiOf(id);
  if (doi) return `${API}https://doi.org/${doi}${query}`;
  if (/^W\d+$/i.test(id)) return `${API}${id.toUpperCase()}${query}`;
  if (/^https?:\/\/openalex\.org\/W\d+$/i.test(id)) return `${API}${id.split("/").pop()!.toUpperCase()}${query}`;
  throw new Error(`not a DOI or an OpenAlex work id: ${identifier}`);
}

/** The bare DOI inside any of the forms a person pastes, or null. */
export function doiOf(identifier: string): string | null {
  const id = identifier.trim().replace(/^doi:/i, "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return /^10\.\d{4,9}\/\S+$/.test(id) ? id : null;
}

/**
 * The abstract, rebuilt from the inverted index.
 *
 * Every word is placed at *each* of its listed positions — a word that
 * occurs twice is listed once with two positions, and dropping the second
 * would silently shorten the text every offset is measured against. A
 * position no word claims is a gap in OpenAlex's own index; it is skipped
 * rather than filled, because inventing a token would move every offset
 * after it.
 */
export function rebuildAbstract(index: InvertedIndex | null | undefined): string | null {
  if (!index) return null;
  const at: (string | undefined)[] = [];
  let last = -1;
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (!Number.isInteger(position) || position < 0) continue;
      at[position] = word;
      if (position > last) last = position;
    }
  }
  if (last < 0) return null;
  const words: string[] = [];
  for (let i = 0; i <= last; i++) {
    const word = at[i];
    if (word !== undefined) words.push(word);
  }
  return words.length === 0 ? null : words.join(" ");
}

/** OpenAlex's own field for the work's primary topic — the string the
 *  same-field exclusion compares. Never an extracted `domain` text. */
export function fieldOf(work: OpenAlexWork): string | null {
  return work.primary_topic?.field?.display_name ?? null;
}

export function titleOf(work: OpenAlexWork): string | null {
  return work.title ?? work.display_name ?? null;
}

/** What rides in `artifact_texts.provenance`, so a citation line and the
 *  domain filter never need a second request. */
export interface PaperProvenance extends Record<string, unknown> {
  doi: string | null;
  openalex_id: string | null;
  field: string | null;
  venue: string | null;
  year: number | null;
  authors: string[];
  url: string | null;
}

export function provenanceOf(work: OpenAlexWork): PaperProvenance {
  return {
    doi: work.doi ? doiOf(work.doi) ?? work.doi : null,
    openalex_id: work.id ?? null,
    field: fieldOf(work),
    venue: work.primary_location?.source?.display_name ?? null,
    year: work.publication_year ?? null,
    authors: (work.authorships ?? [])
      .map((a) => a?.author?.display_name ?? null)
      .filter((name): name is string => typeof name === "string" && name.length > 0),
    url: work.doi ?? work.id ?? null,
  };
}

/** "Author, Author (2021). Title. Venue." — the card's citation line, from
 *  stored provenance alone. */
export function citationLine(provenance: PaperProvenance, title: string | null): string {
  const authors =
    provenance.authors.length === 0
      ? ""
      : provenance.authors.length > 3
        ? `${provenance.authors[0]} et al.`
        : provenance.authors.join(", ");
  const parts = [
    authors,
    provenance.year == null ? "" : `(${provenance.year})`,
    title ?? "",
    provenance.venue ?? "",
  ].filter((part) => part.length > 0);
  return parts.join(". ");
}
