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

  async function add(url: string, filename: string): Promise<void> {
    const entries = await getAll();
    const entry: HistoryEntry = { url, filename, timestamp: Date.now() };
    // Newest first, then trim to the count captured when the manager was created.
    entries.unshift(entry);
    const trimmed = entries.slice(0, maxCount);
    await storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  async function remove(index: number): Promise<void> {
    const entries = await getAll();
    if (index < 0 || index >= entries.length) return; // Stale index: nothing to do.
    entries.splice(index, 1);
    await storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  return { getAll, add, remove };
}
