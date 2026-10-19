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

  it("drops null entries", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "[null]");
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([]);
  });

  it("drops entries missing required fields", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "[{}]");
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([]);
  });

  it("drops entries with wrong field types", async () => {
    const storage = createMockStorage();
    await storage.setItem(
      "upload-history",
      '[{"url":1,"filename":true,"timestamp":"yesterday"}]',
    );
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([]);
  });

  it("keeps well-formed entries alongside malformed ones", async () => {
    const storage = createMockStorage();
    const valid = { url: "https://example.com/a.png", filename: "a.png", timestamp: 1000 };
    await storage.setItem("upload-history", JSON.stringify([null, valid, {}]));
    const mgr = createHistoryManager(storage, 50);
    expect(await mgr.getAll()).toEqual([valid]);
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

  it("adds onto a history containing malformed entries", async () => {
    const storage = createMockStorage();
    await storage.setItem("upload-history", "[null,{}]");
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/a.png");
  });
});

describe("remove", () => {
  it("removes the entry matching url and timestamp", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    await mgr.add("http://example.com/b.png", "b.png");
    await mgr.add("http://example.com/c.png", "c.png");
    const before = await mgr.getAll(); // entries are [c, b, a] (newest first)
    const target = before[1];

    await mgr.remove(target.url, target.timestamp);

    expect(await mgr.getAll()).toEqual([before[0], before[2]]);
  });

  it("keeps entries whose url matches but timestamp differs", async () => {
    const storage = createMockStorage();
    const older = { url: "http://example.com/a.png", filename: "a.png", timestamp: 1000 };
    const newer = { url: "http://example.com/a.png", filename: "a.png", timestamp: 2000 };
    await storage.setItem("upload-history", JSON.stringify([newer, older]));
    const mgr = createHistoryManager(storage, 50);

    await mgr.remove(older.url, older.timestamp);

    expect(await mgr.getAll()).toEqual([newer]);
  });

  it("removes by identity after another upload was inserted", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    const [target] = await mgr.getAll();
    await mgr.add("http://example.com/b.png", "b.png");

    await mgr.remove(target.url, target.timestamp);

    const result = await mgr.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://example.com/b.png");
  });

  it("persists removal to storage", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    const [target] = await mgr.getAll();
    await mgr.remove(target.url, target.timestamp);
    const raw = storage._getRaw("upload-history");
    expect(JSON.parse(raw!)).toEqual([]);
  });

  it("does not write when removing from an empty history", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.remove("http://example.com/missing.png", 1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not rewrite storage when the identity is missing", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    vi.mocked(storage.setItem).mockClear();

    await mgr.remove("http://example.com/a.png", 12345);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await mgr.getAll()).toHaveLength(1);
  });
});

describe("concurrent mutations", () => {
  it("keeps every entry when adds overlap", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);

    await Promise.all([
      mgr.add("http://example.com/a.png", "a.png"),
      mgr.add("http://example.com/b.png", "b.png"),
      mgr.add("http://example.com/c.png", "c.png"),
    ]);

    const urls = (await mgr.getAll()).map((entry) => entry.url).sort();
    expect(urls).toEqual([
      "http://example.com/a.png",
      "http://example.com/b.png",
      "http://example.com/c.png",
    ]);
  });

  it("does not lose an insert that races with a removal", async () => {
    const storage = createMockStorage();
    const mgr = createHistoryManager(storage, 50);
    await mgr.add("http://example.com/a.png", "a.png");
    const [target] = await mgr.getAll();

    await Promise.all([
      mgr.add("http://example.com/b.png", "b.png"),
      mgr.remove(target.url, target.timestamp),
    ]);

    const urls = (await mgr.getAll()).map((entry) => entry.url);
    expect(urls).toEqual(["http://example.com/b.png"]);
  });
});
