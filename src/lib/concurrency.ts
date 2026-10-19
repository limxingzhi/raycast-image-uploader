/**
 * Runs `task` for every item, keeping at most `limit` calls in flight.
 * Rejects as soon as any task rejects; remaining queued items are skipped.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (limit < 1) throw new RangeError("Concurrency limit must be at least 1");
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await task(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
