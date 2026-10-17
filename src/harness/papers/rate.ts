/** A spacing limiter: each request waits until one interval has passed since
 *  the last one started. Sources publish a per-second or per-minute ceiling;
 *  spacing evenly under it never bursts past it. The clock is injected so a
 *  test can run a minute of requests in no time. */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** OpenAlex without a key: 10 requests a second. */
export const OPENALEX_PER_SECOND = 10;
/** OpenAlex under a key: 25 a second, headroom under its 30 for an eval run
 *  and an ingest to overlap. */
export const OPENALEX_KEYED_PER_SECOND = 25;
/** OpenAlex semantic search: one request a second, key or no key. */
export const OPENALEX_SEMANTIC_PER_SECOND = 1;
/** Semantic Scholar search: one request a second, the keyed ceiling. */
export const S2_PER_SECOND = 1;

export type Limiter = () => Promise<void>;

/** At most `count` starts in any `windowMs`, evenly spaced. */
export function limiter(count: number, windowMs: number, clock: Clock = realClock): Limiter {
  const interval = Math.ceil(windowMs / count);
  let last = -Infinity;
  return async () => {
    const wait = last + interval - clock.now();
    if (wait > 0) await clock.sleep(wait);
    last = clock.now();
  };
}

/** The OpenAlex ceiling a key buys, or the keyless one. */
export function openalexPerSecond(apiKey = process.env.OPENALEX_API_KEY?.trim()): number {
  return apiKey ? OPENALEX_KEYED_PER_SECOND : OPENALEX_PER_SECOND;
}

/** A limiter at the OpenAlex ceiling for this key, or for none. */
export function openalexLimiter(apiKey = process.env.OPENALEX_API_KEY?.trim(), clock: Clock = realClock): Limiter {
  return limiter(openalexPerSecond(apiKey), 1000, clock);
}

/** A limiter for OpenAlex semantic search, which allows one request a second. */
export function openalexSemanticLimiter(clock: Clock = realClock): Limiter {
  return limiter(OPENALEX_SEMANTIC_PER_SECOND, 1000, clock);
}

/** A limiter for Semantic Scholar search. */
export function s2Limiter(clock: Clock = realClock): Limiter {
  return limiter(S2_PER_SECOND, 1000, clock);
}
