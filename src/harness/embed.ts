/** Voyage 3.5, over `fetch`. One endpoint, one header, no dependency to
 *  pin.
 *
 *  Without `VOYAGE_API_KEY` this returns null vectors and says so — the
 *  harness runs key-free, writes its rows, and re-embeds them when a key
 *  appears. It never throws for a missing key: an assertion with no vector
 *  is still an assertion, and a run that died because nobody had a key
 *  would lose the extraction too. */
import { EMBEDDING_DIMENSIONS as SCHEMA_DIMENSIONS } from "@/db/schema";

export const EMBEDDING_DIMENSIONS = 1024;

/** A change here is a re-embed job over the rows whose `embedding_model`
 *  differs, never a mixed `<=>` over incompatible spaces. */
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "voyage-3.5";

// The column and the provider have to agree before a single query runs.
if (EMBEDDING_DIMENSIONS !== SCHEMA_DIMENSIONS) {
  throw new Error(
    `embedding dimension mismatch: embed.ts says ${EMBEDDING_DIMENSIONS}, ` +
      `src/db/schema.ts says ${SCHEMA_DIMENSIONS} — the migration and the provider must agree`,
  );
}

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
/** The provider's per-request cap. */
const BATCH = 128;
const RETRIES = 3;

export type InputType = "document" | "query";

export interface EmbedResult {
  /** One per input, in order; null throughout when there is no key. */
  vectors: (number[] | null)[];
  embedded: boolean;
  model: string | null;
  tokens: number | null;
}

interface VoyageResponse {
  data?: { index?: number; embedding: number[] }[];
  usage?: { total_tokens?: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postBatch(
  key: string,
  texts: string[],
  inputType: InputType,
): Promise<{ vectors: number[][]; tokens: number }> {
  let wait = 500;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, input_type: inputType }),
    });
    if (response.status === 429 && attempt < RETRIES) {
      await sleep(wait);
      wait *= 2;
      continue;
    }
    if (!response.ok) {
      throw new Error(`voyage ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const body = (await response.json()) as VoyageResponse;
    const data = body.data ?? [];
    if (data.length !== texts.length) {
      throw new Error(`voyage returned ${data.length} vectors for ${texts.length} texts`);
    }
    // The provider may return out of order; `index` is authoritative.
    const vectors: number[][] = new Array(texts.length);
    data.forEach((d, i) => {
      const at = d.index ?? i;
      if (d.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`voyage returned ${d.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
      }
      vectors[at] = d.embedding;
    });
    return { vectors, tokens: body.usage?.total_tokens ?? 0 };
  }
}

/** Embed in provider-sized batches. Order out matches order in. */
export async function embed(texts: string[], inputType: InputType = "document"): Promise<EmbedResult> {
  const key = process.env.VOYAGE_API_KEY?.trim();
  if (!key) return { vectors: texts.map(() => null), embedded: false, model: null, tokens: null };
  if (texts.length === 0) return { vectors: [], embedded: true, model: EMBEDDING_MODEL, tokens: 0 };

  const vectors: number[][] = [];
  let tokens = 0;
  for (let at = 0; at < texts.length; at += BATCH) {
    const batch = await postBatch(key, texts.slice(at, at + BATCH), inputType);
    vectors.push(...batch.vectors);
    tokens += batch.tokens;
  }
  return { vectors, embedded: true, model: EMBEDDING_MODEL, tokens };
}
