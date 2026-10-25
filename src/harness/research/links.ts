/** A review's `links.json`, held to the search it was written from.
 *
 *  The review may cite only what `search.json` returned. A stored hit is
 *  cited by its document id and stands; a live OpenAlex hit is cited by its
 *  W-id and is ingested now, so the link ends on a stored document — or, when
 *  OpenAlex has no usable abstract for it, moves to `unresolved` with the
 *  ingest's status. Any other id was not given to the model and moves to
 *  `unresolved` as `not_in_search`. Afterwards every id left in `items` is a
 *  stored document id.
 *
 *  Deterministic and pure given `ingest`, so the rule is code rather than a
 *  line of the prompt. Re-running over its own output changes nothing: a
 *  resolved OpenAlex link keeps the W-id it came `from`. */
import { z } from "zod";
import type { PaperSearchHit } from "./search";

export const LINK_KINDS = ["claim", "gap", "smoke_test"] as const;
export const LINK_RELATIONS = ["supports", "contradicts", "taken_by"] as const;

const LinkSchema = z.object({ id: z.string(), relation: z.enum(LINK_RELATIONS), quote: z.string(), from: z.string().optional() });

/** `links.json` as the model wrote it: a wrong kind or relation is refused
 *  by name rather than validated around. */
export const LinksFile = z.object({
  items: z.array(z.object({ text: z.string(), kind: z.enum(LINK_KINDS), links: z.array(LinkSchema) })),
  unresolved: z.array(z.object({ text: z.string(), kind: z.enum(LINK_KINDS), link: LinkSchema, reason: z.string() })).default([]),
});

export interface Link {
  id: string;
  relation: (typeof LINK_RELATIONS)[number];
  quote: string;
  /** The OpenAlex W-id a link was resolved from. */
  from?: string;
}

export interface LinkItem {
  text: string;
  kind: (typeof LINK_KINDS)[number];
  links: Link[];
}

export interface Unresolved {
  text: string;
  kind: LinkItem["kind"];
  link: Link;
  /** `not_in_search`, or the ingest status of a cited OpenAlex work. */
  reason: string;
}

export interface Links {
  items: LinkItem[];
  unresolved: Unresolved[];
}

export type Ingest = (wId: string) => Promise<{ status: string; artifactId?: string }>;

export async function validateLinks(links: Links, hits: PaperSearchHit[], ingest: Ingest): Promise<Links> {
  const stored = new Set(hits.filter((h) => h.source === "corpus").map((h) => h.id));
  const live = new Set(hits.filter((h) => h.source === "openalex").map((h) => h.id));
  const resolved = new Map<string, { status: string; artifactId?: string }>();
  const unresolved: Unresolved[] = [...links.unresolved];

  const items: LinkItem[] = [];
  for (const item of links.items) {
    const kept: Link[] = [];
    for (const link of item.links) {
      const w = link.from ?? link.id;
      if (!link.from && stored.has(link.id)) {
        kept.push(link);
        continue;
      }
      if (!live.has(w)) {
        unresolved.push({ text: item.text, kind: item.kind, link, reason: "not_in_search" });
        continue;
      }
      if (!resolved.has(w)) resolved.set(w, await ingest(w));
      const result = resolved.get(w)!;
      if (result.status === "ok" && result.artifactId) kept.push({ ...link, id: result.artifactId, from: w });
      else unresolved.push({ text: item.text, kind: item.kind, link, reason: result.status });
    }
    items.push({ ...item, links: kept });
  }
  return { items, unresolved };
}
