import { describe, it, expect, vi } from "vitest";

function createMockStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? undefined),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    store,
  };
}

describe("getHistory", () => {
  it("returns empty array when no history exists", async () => {
    const storage = createMockStorage();
    const { createHistoryManager } = await import("./history");
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
    storage.store["upload-history"] = JSON.stringify(entries);
    const { createHistoryManager } = await import("./history");
    const mgr = createHistoryManager(storage, 50);
    const result = await mgr.getAll();
    expect(result).toEqual(entries);
  });
});

describe("addEntry", () => {
  it("adds entry and persists to storage", async () => {
    const storage = createMockStorage();
    const { createHistoryManager } = await import("./history");
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
    const { createHistoryManager } = await import("./history");
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/first.png", "first.png");
    await mgr.add("http://example.com/second.png", "second.png");
    const result = await mgr.getAll();
    expect(result[0].url).toBe("http://example.com/second.png");
    expect(result[1].url).toBe("http://example.com/first.png");
  });

  it("trims to maxCount", async () => {
    const storage = createMockStorage();
    const { createHistoryManager } = await import("./history");
    const mgr = createHistoryManager(storage, 2);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    await mgr.add("http://example.com/c.png", "c.png");
    const result = await mgr.getAll();
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("http://example.com/c.png");
    expect(result[1].url).toBe("http://example.com/b.png");
  });
});

describe("remove", () => {
  it("removes entry at given index", async () => {
    const storage = createMockStorage();
    const { createHistoryManager } = await import("./history");
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
    const { createHistoryManager } = await import("./history");
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
    const { createHistoryManager } = await import("./history");
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
    const { createHistoryManager } = await import("./history");
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.remove(0);
    const raw = storage.store["upload-history"];
    expect(JSON.parse(raw)).toEqual([]);
  });
});
