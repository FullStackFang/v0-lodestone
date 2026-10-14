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

/** OpenAlex's polite pool: 10 requests a second. */
export const OPENALEX_PER_SECOND = 10;
/** PatentsView: 45 requests a minute. */
export const PATENTSVIEW_PER_MINUTE = 45;

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
