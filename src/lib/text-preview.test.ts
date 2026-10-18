import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "./history";
import { fetchTextPreview, MAX_PREVIEW_SIZE } from "./text-preview";

const entry: HistoryEntry = {
  url: "https://example.com/files/notes.txt",
  filename: "notes.txt",
  timestamp: 0,
};

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function responseWith(body: ReadableStream<Uint8Array> | null, ok = true): Response {
  return { ok, body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTextPreview", () => {
  it("returns the decoded text for a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responseWith(streamOf(["hello ", "world"]))),
    );

    const result = await fetchTextPreview(entry, new AbortController().signal);

    expect(result).toBe("hello world");
  });

  it("returns null for a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responseWith(streamOf(["ignored"]), false)),
    );

    const result = await fetchTextPreview(entry, new AbortController().signal);

    expect(result).toBeNull();
  });

  it("returns null when the response has no body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWith(null)));

    const result = await fetchTextPreview(entry, new AbortController().signal);

    expect(result).toBeNull();
  });

  it("passes the abort signal and URL to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWith(streamOf(["x"])));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await fetchTextPreview(entry, controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(entry.url, { signal: controller.signal });
  });

  it("returns null when the body exceeds the byte cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responseWith(streamOf(["12345", "67890"]))),
    );

    const result = await fetchTextPreview(entry, new AbortController().signal, 8);

    expect(result).toBeNull();
  });

  it("returns an empty string for an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWith(streamOf([]))));

    const result = await fetchTextPreview(entry, new AbortController().signal);

    expect(result).toBe("");
  });

  it("cancels the reader when the cap is exceeded", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123456789"));
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWith(stream)));

    const result = await fetchTextPreview(entry, new AbortController().signal, 4);

    expect(result).toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it("uses a 5 MB default cap", () => {
    expect(MAX_PREVIEW_SIZE).toBe(5 * 1024 * 1024);
  });
});
