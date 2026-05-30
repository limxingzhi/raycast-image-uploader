export interface StorageAdapter {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
}

export interface HistoryEntry {
  url: string;
  filename: string;
  timestamp: number;
}

const STORAGE_KEY = "upload-history";

export function createHistoryManager(
  storage: StorageAdapter,
  maxCount: number,
) {
  async function getAll(): Promise<HistoryEntry[]> {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  }

  async function add(url: string, filename: string): Promise<void> {
    const entries = await getAll();
    const entry: HistoryEntry = { url, filename, timestamp: Date.now() };
    entries.unshift(entry);
    const trimmed = entries.slice(0, maxCount);
    await storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  return { getAll, add };
}
