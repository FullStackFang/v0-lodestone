/** The vectors a Forge card has in the ledger, read back for matching.
 *
 * Every idea row `projectForgeIdea` filed carries `provenance.kind = "forge"`
 * and the canvas block it came from, so a match can always say which block
 * produced it. `open` entries and `not_stated` rows have no vector and never
 * appear here. */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions } from "@/db/schema";
import { forgeSubject } from "@/harness/founder/forge";
import { cosine } from "@/harness/founder/repeat";

export interface IdeaVector {
  id: string;
  ideaId: string;
  facet: string;
  block: string;
  text: string;
  embedding: number[];
}

/** A subject's rows, keyed by idea id. Ideas with no embedded rows are absent. */
export async function ideaVectors(db: Db, ideaIds: string[]): Promise<Map<string, IdeaVector[]>> {
  const out = new Map<string, IdeaVector[]>();
  if (ideaIds.length === 0) return out;
  const rows = await db
    .select({
      id: assertions.id,
      subjectId: assertions.subjectId,
      facet: assertions.facet,
      text: assertions.text,
      embedding: assertions.embedding,
      provenance: assertions.provenance,
    })
    .from(assertions)
    .where(
      and(
        eq(assertions.status, "active"),
        eq(assertions.subjectType, "idea"),
        isNotNull(assertions.embedding),
        inArray(assertions.subjectId, ideaIds.map(forgeSubject)),
        sql`${assertions.provenance} ->> 'kind' = 'forge'`,
      ),
    );
  for (const row of rows) {
    const p = row.provenance as { idea_id?: string; block?: string };
    const ideaId = p.idea_id ?? row.subjectId.replace(/^forge:/, "");
    const list = out.get(ideaId) ?? [];
    list.push({
      id: row.id,
      ideaId,
      facet: row.facet ?? "unknown",
      block: p.block ?? "unknown",
      text: row.text,
      embedding: row.embedding as number[],
    });
    out.set(ideaId, list);
  }
  return out;
}

/** How much each facet family counts in a card's single blended vector —
 *  the arbitrage PoC's `BLOCK_WEIGHTS`, carried over facet by facet. A
 *  family the card has no rows for is dropped and the rest renormalised. */
export const FAMILY_WEIGHTS: Record<string, number> = {
  purpose: 0.35,
  constraint: 0.3,
  mechanism: 0.2,
  domain: 0.15,
};

export function familyOf(facet: string): string {
  if (facet.startsWith("mechanism")) return "mechanism";
  return facet;
}

function mean(vectors: number[][]): number[] {
  const out = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vectors.length;
  return out;
}

export function unit(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/** One unit vector per card, for the map only. Matching never blends —
 *  `score.ts` says why — but a map needs one point per card. */
export function blended(rows: IdeaVector[]): number[] | null {
  const byFamily = new Map<string, number[][]>();
  for (const r of rows) {
    const f = familyOf(r.facet);
    if (!(f in FAMILY_WEIGHTS)) continue;
    byFamily.set(f, [...(byFamily.get(f) ?? []), r.embedding]);
  }
  if (byFamily.size === 0) return null;
  let total = 0;
  for (const f of byFamily.keys()) total += FAMILY_WEIGHTS[f];
  const dims = rows[0].embedding.length;
  const out = new Array<number>(dims).fill(0);
  for (const [f, vs] of byFamily) {
    const m = mean(vs);
    const w = FAMILY_WEIGHTS[f] / total;
    for (let i = 0; i < dims; i++) out[i] += w * m[i];
  }
  return unit(out);
}

/** Symmetric mean-of-max cosine between two row sets. Null when either is empty. */
export function setSim(a: IdeaVector[], b: IdeaVector[]): { value: number; pair: [IdeaVector, IdeaVector] } | null {
  if (a.length === 0 || b.length === 0) return null;
  const best = { value: -Infinity, pair: [a[0], b[0]] as [IdeaVector, IdeaVector] };
  const direction = (from: IdeaVector[], to: IdeaVector[]) => {
    let total = 0;
    for (const x of from) {
      let max = -Infinity;
      let at = to[0];
      for (const y of to) {
        const c = cosine(x.embedding, y.embedding);
        if (c > max) {
          max = c;
          at = y;
        }
      }
      total += max;
      if (max > best.value) {
        best.value = max;
        best.pair = from === a ? [x, at] : [at, x];
      }
    }
    return total / from.length;
  };
  const value = (direction(a, b) + direction(b, a)) / 2;
  return { value, pair: best.pair };
}

export { cosine };
