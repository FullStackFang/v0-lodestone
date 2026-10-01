/** A deterministic stand-in embedder for tests: a hashed bag of words in
 *  1024 dimensions, unit length. Two texts that share words come out close;
 *  two that share none come out near orthogonal. It sends nothing anywhere. */
import { createHash } from "node:crypto";
import { EMBEDDING_DIMENSIONS, type EmbedResult } from "@/harness/embed";
import { tokens } from "./geometry";
import { unit } from "./vectors";

export const TEST_MODEL = "test-bag-of-words";

export function testVector(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const ts = tokens(text);
  if (ts.length === 0) ts.push("empty");
  for (const t of ts) {
    const h = createHash("sha1").update(t).digest();
    const at = h.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
    v[at] += 1;
  }
  return unit(v);
}

export async function testEmbed(texts: string[]): Promise<EmbedResult> {
  return { vectors: texts.map(testVector), embedded: true, model: TEST_MODEL, tokens: texts.length };
}
