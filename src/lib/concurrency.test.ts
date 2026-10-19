import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("processes every item", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 3, async (item) => {
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("runs up to the limit at the same time", async () => {
    const gates = Array.from({ length: 4 }, () => deferred());
    let started = 0;
    const run = mapWithConcurrency([0, 1, 2, 3], 4, async (index) => {
      started++;
      await gates[index].promise;
    });

    await vi.waitFor(() => expect(started).toBe(4));
    gates.forEach((gate) => gate.resolve());
    await run;
  });

  it("handles an empty list", async () => {
    const task = vi.fn(async () => {});
    await mapWithConcurrency([], 3, task);
    expect(task).not.toHaveBeenCalled();
  });

  it("rejects when the limit is below one", async () => {
    await expect(mapWithConcurrency([1], 0, async () => {})).rejects.toBeInstanceOf(
      RangeError,
    );
  });
});
