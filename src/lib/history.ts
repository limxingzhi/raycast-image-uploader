export interface StorageAdapter {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
}

export interface HistoryEntry {
  url: string;
  filename: string;
  timestamp: number;
}

const STORAGE_KEY = "upload-history"; // Single key holding the JSON array.

function isHistoryEntry(value: unknown): value is HistoryEntry {
  // Corrupt storage can contain null, primitives, or objects with wrong types.
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.url === "string" &&
    typeof entry.filename === "string" &&
    typeof entry.timestamp === "number" &&
    Number.isFinite(entry.timestamp)
  );
}

export function createHistoryManager(
  storage: StorageAdapter,
  maxCount: number,
) {
  // Mutations are read-modify-write, so they must not interleave or concurrent
  // adds can overwrite each other and identity removal can read a stale list.
  let mutationQueue: Promise<unknown> = Promise.resolve();

  function enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
    const run = mutationQueue.then(task, task);
    // Keep the queue alive even if this mutation rejects.
    mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function getAll(): Promise<HistoryEntry[]> {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      // Drop malformed rows instead of letting them crash the Recent Uploads view.
      return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
    } catch {
      return [];
    }
  }

  function add(url: string, filename: string): Promise<void> {
    return enqueueMutation(async () => {
      const entries = await getAll();
      const entry: HistoryEntry = { url, filename, timestamp: Date.now() };
      // Newest first, then trim to the count captured when the manager was created.
      entries.unshift(entry);
      const trimmed = entries.slice(0, maxCount);
      await storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    });
  }

  function remove(url: string, timestamp: number): Promise<void> {
    return enqueueMutation(async () => {
      const entries = await getAll();
      // Identify the row by value; an index captured before an insert can point
      // at a different upload by the time the user confirms the deletion.
      const index = entries.findIndex(
        (entry) => entry.url === url && entry.timestamp === timestamp,
      );
      if (index === -1) return; // Already gone: nothing to write.
      entries.splice(index, 1);
      await storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    });
  }

  return { getAll, add, remove };
}
