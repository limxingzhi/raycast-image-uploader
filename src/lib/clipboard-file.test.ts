import { describe, it, expect, vi } from "vitest";
import { existsSync } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { extractClipboardFileToTempFile } from "./clipboard-file";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe("extractClipboardFileToTempFile", () => {
  it("returns the path of the file written by the extractor", async () => {
    const runOsascript = async (outputDir: string) => {
      const path = join(outputDir, "clipboard.pdf");
      await writeFile(path, PDF_BYTES);
      return path;
    };

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    expect(result).not.toBeNull();
    expect(result?.path.endsWith("clipboard.pdf")).toBe(true);
    expect(existsSync(result!.path)).toBe(true);
    expect(new Uint8Array(await readFile(result!.path))).toEqual(PDF_BYTES);

    await rm(result!.cleanupDir, { recursive: true, force: true });
  });

  it("returns the path of a file that already exists on disk", async () => {
    const runOsascript = async () => "/Users/test/Downloads/report.pdf";

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    expect(result?.path).toBe("/Users/test/Downloads/report.pdf");

    await rm(result!.cleanupDir, { recursive: true, force: true });
  });

  it("returns null and cleans up when the extractor fails", async () => {
    let cleanupDir = "";
    const runOsascript = async (outputDir: string) => {
      cleanupDir = outputDir;
      throw new Error("Clipboard does not contain a file.");
    };

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    expect(result).toBeNull();
    expect(existsSync(cleanupDir)).toBe(false);
  });

  it("returns null when the extractor returns an empty path", async () => {
    const runOsascript = vi.fn(async () => "");

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    expect(result).toBeNull();
  });

  it("does not run the extractor on non-macOS platforms", async () => {
    const runOsascript = vi.fn(async () => "/tmp/unused.png");

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "linux" });

    expect(result).toBeNull();
    expect(runOsascript).not.toHaveBeenCalled();
  });
});
