/** What a patent is to Lodestone regardless of where it was fetched from:
 *  the number its row is keyed by, the CPC section that stands in for a
 *  paper's `field`, and the provenance shape `priorArt.ts`, `digest.ts` and
 *  the read endpoint read. The fetcher (`bigquery-patents.ts`) fills these;
 *  nothing here touches a source or the database. */

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

/** "G — Physics" for a CPC code (`G01K1/02`) or a bare section letter; null
 *  for anything that is not a section. */
export function cpcSectionName(code: string | null | undefined): string | null {
  const section = code?.trim().charAt(0).toUpperCase();
  const name = section ? CPC_SECTIONS[section] : undefined;
  return name ? `${section} — ${name}` : null;
}

/** The number a patent row is keyed by (`artifact_texts.provenance.patent_number`,
 *  unique under migration 0013): the publication number without its country
 *  and kind code, so `US-10123456-B2` from BigQuery, `US10123456B2` from a
 *  person, and the bare `10123456` the old source wrote are one row. Design
 *  (`D912345`) and reissue (`RE48123`) prefixes are part of the number. */
export function patentNumberOf(identifier: string): string {
  const parts = identifier.trim().toUpperCase().replace(/[\s,]/g, "").split("-").filter((p) => p.length > 0);
  if (parts.length > 1) {
    if (/^[A-Z]{2}$/.test(parts[0])) parts.shift();
    if (parts.length > 1 && /^[A-Z]\d?$/.test(parts[parts.length - 1])) parts.pop();
    return parts.join("-");
  }
  return (parts[0] ?? "").replace(/^US/, "").replace(/[A-Z]\d?$/, "");
}

/** What rides in `artifact_texts.provenance` for a patent, beside the query
 *  set it came from. The keys are fixed: the read endpoint and the citation
 *  line are written against them. */
export interface PatentProvenance extends Record<string, unknown> {
  patent_number: string | null;
  url: string | null;
  assignees: string[];
  inventors: string[];
  cpc: string[];
  year: number | null;
  field: string | null;
}
