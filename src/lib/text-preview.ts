import type { HistoryEntry } from "./history";

export const MAX_PREVIEW_SIZE = 5 * 1024 * 1024;

/** Fetch a text preview, capping the response body at `maxSize` bytes. */
export async function fetchTextPreview(
  entry: HistoryEntry,
  signal: AbortSignal,
  maxSize = MAX_PREVIEW_SIZE,
): Promise<string | null> {
  const response = await fetch(entry.url, { signal });
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxSize) return null; // too large, abort
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return result;
}
