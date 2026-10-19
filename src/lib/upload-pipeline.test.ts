import { describe, it, expect, vi } from "vitest";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { extractClipboardFileToTempFile } from "./clipboard-file";
import { typeFromExtension, typeFromContent, extensionFromPath, isTextPreviewable } from "./mime";
import { generateKey } from "./s3";
import { createHistoryManager, type StorageAdapter } from "./history";

/**
 * End-to-end check of the path a clipboard payload takes from extraction to the
 * history entry that Recent Uploads renders: extract -> detect -> key -> store.
 *
 * Written for the reported bug where a PDF copied out of a viewer never showed
 * up as a PDF in Recent Uploads. The command files themselves are not testable
 * under vitest (they import @raycast/api at module scope), so this composes the
 * real lib functions in the same order the command calls them.
 */

function createMockStorage(): StorageAdapter {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn(async (key: string) => store[key] ?? undefined),
    setItem: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

async function uploadFromClipboard(writtenName: string, bytes: Uint8Array) {
  const runOsascript = async (outputDir: string) => {
    const path = join(outputDir, writtenName);
    await writeFile(path, bytes);
    return path;
  };

  const storage = createMockStorage();
  const history = createHistoryManager(storage, 50);

  const extracted = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });
  expect(extracted).not.toBeNull();
  const path = extracted!.path;

  try {
    const mimeType =
      typeFromExtension(path) ?? typeFromContent(bytes) ?? "application/octet-stream";
    const key = generateKey(mimeType, extensionFromPath(path));
    await history.add(`https://s3.example.com/bucket/${key}`, key);
    return { key, mimeType, entries: await history.getAll() };
  } finally {
    await rm(extracted!.cleanupDir, { recursive: true, force: true });
  }
}

describe("clipboard payload -> upload history", () => {
  it("records a PDF as a document entry, not a rasterized PNG", async () => {
    const { key, mimeType, entries } = await uploadFromClipboard("clipboard.pdf", PDF_BYTES);

    expect(mimeType).toBe("application/pdf");
    expect(key).toMatch(/^[0-9a-f-]+\.pdf$/);
    expect(entries).toHaveLength(1);
    expect(entries[0].filename).toMatch(/\.pdf$/);
    expect(entries[0].url).toBe(`https://s3.example.com/bucket/${key}`);
  });

  it("classifies the PDF entry the way Recent Uploads does", async () => {
    const { entries } = await uploadFromClipboard("clipboard.pdf", PDF_BYTES);

    const type = typeFromExtension(entries[0].filename);
    // Not an image, so it renders with the Document icon and no inline image.
    expect(type?.startsWith("image/")).toBe(false);
    // Not text, so Recent Uploads does not fetch a text preview for it.
    expect(type && isTextPreviewable(type)).toBe(false);
  });

  it("keeps an extension that has no MIME mapping instead of falling back to bin", async () => {
    const { key, entries } = await uploadFromClipboard("clipboard.psd", new Uint8Array([0x38, 0x42, 0x50, 0x53]));

    expect(key).toMatch(/^[0-9a-f-]+\.psd$/);
    expect(entries[0].filename).toMatch(/\.psd$/);
  });

  it("still records an image entry for an image payload", async () => {
    const { key, mimeType } = await uploadFromClipboard(
      "clipboard.png",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    expect(mimeType).toBe("image/png");
    expect(key).toMatch(/^[0-9a-f-]+\.png$/);
  });

  it("records plain text as a txt entry that Recent Uploads previews", async () => {
    const { key, mimeType, entries } = await uploadFromClipboard(
      "clipboard.txt",
      new TextEncoder().encode("hello from the clipboard"),
    );

    expect(mimeType).toBe("text/plain");
    expect(key).toMatch(/^[0-9a-f-]+\.txt$/);
    expect(entries[0].filename).toMatch(/\.txt$/);

    const type = typeFromExtension(entries[0].filename);
    expect(type && isTextPreviewable(type)).toBe(true);
  });

  it("falls back to magic bytes when the filename has no extension", async () => {
    const { key, mimeType, entries } = await uploadFromClipboard(
      "clipboard",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    expect(mimeType).toBe("image/png");
    expect(key).toMatch(/^[0-9a-f-]+\.png$/);
    expect(entries[0].filename).toMatch(/\.png$/);
  });

  it("records an archive with its own extension", async () => {
    const { key, mimeType } = await uploadFromClipboard(
      "clipboard.zip",
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    );

    expect(mimeType).toBe("application/zip");
    expect(key).toMatch(/^[0-9a-f-]+\.zip$/);
  });

  it("uses bin for unknown content when there is no extension", async () => {
    const { key, mimeType } = await uploadFromClipboard(
      "clipboard",
      new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    );

    expect(mimeType).toBe("application/octet-stream");
    expect(key).toMatch(/^[0-9a-f-]+\.bin$/);
  });

  it("writes no history when the clipboard has no usable payload", async () => {
    const storage = createMockStorage();
    const history = createHistoryManager(storage, 50);

    const extracted = await extractClipboardFileToTempFile({
      runOsascript: async () => {
        throw new Error("Clipboard does not contain a file.");
      },
      platform: "darwin",
    });

    expect(extracted).toBeNull();
    expect(await history.getAll()).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
