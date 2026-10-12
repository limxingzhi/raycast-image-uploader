import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const CLIPBOARD_IMAGE_SCRIPT = `
ObjC.import("AppKit");

function pngFileType() {
  return $.NSBitmapImageFileTypePNG === undefined ? $.NSPNGFileType : $.NSBitmapImageFileTypePNG;
}

function writePng(data, outputPath) {
  if (!data) return false;
  return data.writeToFileAtomically($(outputPath), true);
}

function convertToPng(data) {
  if (!data) return null;
  const rep = $.NSBitmapImageRep.imageRepWithData(data);
  if (!rep) return null;
  return rep.representationUsingTypeProperties(pngFileType(), $());
}

function run(argv) {
  const outputPath = argv[0];
  const pasteboard = $.NSPasteboard.generalPasteboard;

  if (writePng(pasteboard.dataForType("public.png"), outputPath)) return outputPath;

  const tiff = pasteboard.dataForType("public.tiff");
  if (writePng(convertToPng(tiff), outputPath)) return outputPath;

  const images = pasteboard.readObjectsForClassesOptions($([$.NSImage.class()]), $());
  if (images && images.count > 0) {
    const image = images.objectAtIndex(0);
    if (writePng(convertToPng(image.TIFFRepresentation), outputPath)) return outputPath;
  }

  throw new Error("Clipboard does not contain an image.");
}
`;

export type OsascriptRunner = (outputPath: string) => Promise<void>;

export interface ExtractedClipboardImage {
  path: string;
  cleanupDir: string;
}

export async function defaultOsascriptRunner(outputPath: string): Promise<void> {
  await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", CLIPBOARD_IMAGE_SCRIPT, outputPath],
    { timeout: 5000 },
  );
}

export async function extractClipboardImageToTempFile(
  options: { runOsascript?: OsascriptRunner; platform?: NodeJS.Platform } = {},
): Promise<ExtractedClipboardImage | null> {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") return null;

  const runOsascript = options.runOsascript ?? defaultOsascriptRunner;
  const cleanupDir = await mkdtemp(join(tmpdir(), "raycast-image-uploader-"));
  const path = join(cleanupDir, "clipboard.png");

  try {
    await runOsascript(path);
  } catch (err) {
    console.error("Failed to extract clipboard image:", err);
    await rm(cleanupDir, { recursive: true, force: true });
    return null;
  }

  return { path, cleanupDir };
}
