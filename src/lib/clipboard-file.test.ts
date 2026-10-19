import { describe, it, expect, vi } from "vitest";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
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

  it("creates a unique temp directory under the system temp directory", async () => {
    const dirs: string[] = [];
    const runOsascript = async (outputDir: string) => {
      dirs.push(outputDir);
      const path = join(outputDir, "clipboard.png");
      await writeFile(path, PDF_BYTES);
      return path;
    };

    const first = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });
    const second = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    try {
      expect(dirs).toHaveLength(2);
      expect(dirs[0]).not.toBe(dirs[1]);
      expect(dirs[0].startsWith(tmpdir())).toBe(true);
      expect(dirs[1].startsWith(tmpdir())).toBe(true);
      expect(dirs[0]).toContain("raycast-image-uploader-");
      expect(dirs[1]).toContain("raycast-image-uploader-");
    } finally {
      await rm(first!.cleanupDir, { recursive: true, force: true });
      await rm(second!.cleanupDir, { recursive: true, force: true });
    }
  });

  it("keeps the cleanup directory until the caller removes it", async () => {
    const runOsascript = async (outputDir: string) => {
      const path = join(outputDir, "clipboard.pdf");
      await writeFile(path, PDF_BYTES);
      return path;
    };

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    expect(existsSync(result!.cleanupDir)).toBe(true);
    expect(existsSync(result!.path)).toBe(true);

    await rm(result!.cleanupDir, { recursive: true, force: true });
  });

  it("removes a populated temp directory when the extractor fails", async () => {
    let cleanupDir = "";
    const runOsascript = async (outputDir: string) => {
      cleanupDir = outputDir;
      await writeFile(join(outputDir, "partial.png"), PDF_BYTES);
      throw new Error("extraction failed");
    };

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    expect(result).toBeNull();
    expect(existsSync(cleanupDir)).toBe(false);
  });

  it("does not delete a returned file outside the temp directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clipboard-existing-"));
    const path = join(dir, "report.pdf");
    await writeFile(path, PDF_BYTES);
    const runOsascript = async () => path;

    const result = await extractClipboardFileToTempFile({ runOsascript, platform: "darwin" });

    try {
      expect(result?.path).toBe(path);
      expect(existsSync(path)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(result!.cleanupDir, { recursive: true, force: true });
    }
  });
});
