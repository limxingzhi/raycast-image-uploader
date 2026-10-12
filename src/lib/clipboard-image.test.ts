import { describe, it, expect, vi } from "vitest";
import { existsSync } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { extractClipboardImageToTempFile } from "./clipboard-image";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("extractClipboardImageToTempFile", () => {
  it("returns the path of the PNG written by the extractor", async () => {
    const runOsascript = async (outputPath: string) => {
      await writeFile(outputPath, PNG_BYTES);
    };

    const result = await extractClipboardImageToTempFile({ runOsascript, platform: "darwin" });

    expect(result).not.toBeNull();
    expect(result?.path.endsWith("clipboard.png")).toBe(true);
    expect(existsSync(result!.path)).toBe(true);
    expect(new Uint8Array(await readFile(result!.path))).toEqual(PNG_BYTES);

    await rm(result!.cleanupDir, { recursive: true, force: true });
  });

  it("returns null and cleans up when the extractor fails", async () => {
    const runOsascript = async () => {
      throw new Error("Clipboard does not contain an image.");
    };

    const result = await extractClipboardImageToTempFile({ runOsascript, platform: "darwin" });

    expect(result).toBeNull();
  });

  it("does not run the extractor on non-macOS platforms", async () => {
    const runOsascript = vi.fn(async (outputPath: string) => {
      await writeFile(outputPath, PNG_BYTES);
    });

    const result = await extractClipboardImageToTempFile({ runOsascript, platform: "linux" });

    expect(result).toBeNull();
    expect(runOsascript).not.toHaveBeenCalled();
  });
});
