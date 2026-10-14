import { describe, expect, it } from "vitest";
import { limiter, OPENALEX_PER_SECOND, PATENTSVIEW_PER_MINUTE, type Clock } from "./rate";

function fakeClock(): Clock & { starts: number[] } {
  let t = 0;
  const starts: number[] = [];
  return {
    starts,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

async function run(count: number, perWindow: number, windowMs: number) {
  const clock = fakeClock();
  const wait = limiter(perWindow, windowMs, clock);
  for (let i = 0; i < count; i++) {
    await wait();
    clock.starts.push(clock.now());
  }
  return clock.starts;
}

/** The most starts any window of this length holds. */
function busiest(starts: number[], windowMs: number): number {
  return Math.max(...starts.map((s) => starts.filter((x) => x >= s && x < s + windowMs).length));
}

describe("limiter", () => {
  it("holds OpenAlex to ten requests a second", async () => {
    const starts = await run(35, OPENALEX_PER_SECOND, 1000);
    expect(busiest(starts, 1000)).toBe(10);
    expect(starts[1] - starts[0]).toBe(100);
  });

  it("holds PatentsView to forty-five requests a minute", async () => {
    const starts = await run(100, PATENTSVIEW_PER_MINUTE, 60_000);
    expect(busiest(starts, 60_000)).toBeLessThanOrEqual(45);
    expect(starts.at(-1)).toBeLessThan(3 * 60_000);
  });

  it("does not wait when the interval has already passed", async () => {
    const clock = fakeClock();
    const wait = limiter(10, 1000, clock);
    await wait();
    await clock.sleep(500);
    const before = clock.now();
    await wait();
    expect(clock.now()).toBe(before);
  });
});
