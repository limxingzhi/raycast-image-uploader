import { describe, it, expect, vi } from "vitest";
import { createHistoryManager, type StorageAdapter } from "./history";

function createMockStorage(): StorageAdapter & { _getRaw: (key: string) => string } {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn(async (key: string) => store[key] ?? undefined),
    setItem: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    _getRaw: (key: string) => store[key],
  };
}

describe("getHistory", () => {
  it("returns empty array when no history exists", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    const result = await mgr.getAll();
    expect(result).toEqual([]);
  });

  it("returns parsed history from storage", async () => {
    const storage = createMockStorage();
    const entries = [
      { url: "http://example.com/a.png", filename: "a.png", timestamp: 1000 },
      { url: "http://example.com/b.png", filename: "b.png", timestamp: 2000 },
    ];
    await storage.setItem("upload-history", JSON.stringify(entries));
    const mgr = createHistoryManager(storage, 50);
    const result = await mgr.getAll();
    expect(result).toEqual(entries);
  });

  it("returns empty array when storage contains invalid JSON", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "not valid json{{{");
    const mgr = createHistoryManager(storage, 50);
    const result = await mgr.getAll();
    expect(result).toEqual([]);
  });

  it("returns empty array when the stored value is empty", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "");
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([]);
  });

  it("returns empty array when stored JSON is null", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "null");
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([]);
  });

  it("returns empty array when stored JSON is an object", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", '{"url":"https://example.com/a.png"}');
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([]);
  });
});

describe("addEntry", () => {
  it("adds entry and persists to storage", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/a.png");
    expect(result[0].filename).toBe("a.png");
    expect(result[0].timestamp).toBeTypeOf("number");
  });

  it("prepends new entry", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/first.png", "first.png");
    await mgr.add("http://example.com/second.png", "second.png");
    const result = await mgr.getAll();
    expect(result[0].url).toBe("http://example.com/second.png");
    expect(result[1].url).toBe("http://example.com/first.png");
  });

  it("trims to maxCount", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 2);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    await mgr.add("http://example.com/c.png", "c.png");
    const result = await mgr.getAll();
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("http://example.com/c.png");
    expect(result[1].url).toBe("http://example.com/b.png");
  });

  it("keeps only the newest entry when maxCount is 1", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 1);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/b.png");
  });

  it("persists under the upload-history key", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    expect(storage.setItem).toHaveBeenCalledWith("upload-history", expect.any(String));
  });

  it("records the current time as the timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-02T03:04:05.000Z"));
    try {
      const storage = createMockStorage();
      const mgr = createHistoryManager(storage, 50);
      await mgr.add("http://example.com/a.png", "a.png");
      const result = await mgr.getAll();
      expect(result[0].timestamp).toBe(Date.parse("2025-01-02T03:04:05.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a fresh history when the stored JSON is corrupt", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "{not json");
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/a.png");
  });
});

describe("remove", () => {
  it("removes entry at given index", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    await mgr.add("http://example.com/c.png", "c.png");
    // entries are [c, b, a] (newest first)
    await mgr.remove(1);
    const result = await mgr.getAll();
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("http://example.com/c.png");
    expect(result[1].url).toBe("http://example.com/a.png");
  });

  it("removes first entry", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    // entries are [b, a]
    await mgr.remove(0);
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/a.png");
  });

  it("removes last entry", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    // entries are [b, a]
    await mgr.remove(1);
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/b.png");
  });

  it("persists removal to storage", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.remove(0);
    const raw = storage._getRaw("upload-history");
    expect(JSON.parse(raw!)).toEqual([]);
  });

  it("does nothing when index is out of bounds (negative)", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.remove(-1);
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
  });

  it("does nothing when index is out of bounds (too large)", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.remove(100);
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
  });

  it("does not write when removing from an empty history", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.remove(0);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not rewrite storage for an out-of-bounds index", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    vi.mocked(storage.setItem).mockClear();
    await mgr.remove(5);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
