import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * JXA script that writes the most faithful payload on the pasteboard to disk.
 *
 * macOS puts file *contents* (not just a file URL) on the pasteboard whenever an
 * app copies something other than a file reference, e.g. a PDF rendered by
 * Preview or a spreadsheet selected in Excel. `Clipboard.read().file` is empty
 * in those cases, so the payload is written out here using its own uniform type
 * identifier, which keeps the original file type (PDF stays a PDF) instead of
 * coercing everything through a rasterized PNG.
 *
 * Prints the path of the written file on success and throws otherwise.
 */
export const CLIPBOARD_FILE_SCRIPT = `
ObjC.import("AppKit");
try {
  ObjC.import("UniformTypeIdentifiers");
} catch (error) {
  // macOS < 11: fall back to the static extension table below.
}

function unwrap(value) {
  if (value === undefined || value === null) return null;
  try {
    return ObjC.unwrap(value);
  } catch (error) {
    return null;
  }
}

// Used when UTType is unavailable, and to pin the extension of common types.
var FALLBACK_EXTENSIONS = {
  "public.png": "png",
  "public.jpeg": "jpg",
  "public.tiff": "tiff",
  "public.heic": "heic",
  "public.heif": "heif",
  "com.compuserve.gif": "gif",
  "org.webmproject.webp": "webp",
  "com.microsoft.bmp": "bmp",
  "public.svg-image": "svg",
  "com.adobe.pdf": "pdf",
  "public.rtf": "rtf",
  "public.html": "html",
  "public.json": "json",
  "public.xml": "xml",
  "public.yaml": "yaml",
  "public.utf8-plain-text": "txt",
  "public.plain-text": "txt",
  "public.comma-separated-values-text": "csv",
  "public.zip-archive": "zip",
  "org.gnu.gnu-zip-archive": "gz",
  "public.tar-archive": "tar",
  "org.openxmlformats.wordprocessingml.document": "docx",
  "com.microsoft.word.doc": "doc",
  "org.openxmlformats.spreadsheetml.sheet": "xlsx",
  "com.microsoft.excel.xls": "xls",
  "org.openxmlformats.presentationml.presentation": "pptx",
  "com.microsoft.powerpoint.ppt": "ppt",
  "public.mpeg-4": "mp4",
  "com.apple.quicktime-movie": "mov",
  "public.mpeg-4-audio": "m4a",
  "public.mp3": "mp3",
  "public.wav": "wav",
  "public.aiff-audio": "aiff",
  "public.flac-audio": "flac",
  "public.ogg-audio": "ogg"
};

// Rendered image variants of the same content, most canonical first.
var IMAGE_PREFERENCE = [
  "public.png",
  "public.jpeg",
  "public.heic",
  "public.heif",
  "com.compuserve.gif",
  "org.webmproject.webp",
  "public.tiff",
  "com.microsoft.bmp"
];

var TEXT_IDENTIFIERS = [
  "public.utf8-plain-text",
  "public.plain-text",
  "public.utf16-plain-text",
  "com.apple.traditional-mac-plain-text"
];

var TRANSIENT_PREFIXES = ["dyn.", "com.apple.pasteboard.", "com.apple.webarchive"];

function utTypeFor(identifier) {
  if (!$ || !$.UTType || typeof $.UTType.typeWithIdentifier !== "function") return null;
  try {
    return $.UTType.typeWithIdentifier($(identifier));
  } catch (error) {
    return null;
  }
}

function conformsTo(identifier, supertype) {
  var type = utTypeFor(identifier);
  var parent = utTypeFor(supertype);
  if (!type || !parent) return false;
  try {
    return type.conformsToType(parent);
  } catch (error) {
    return false;
  }
}

function extensionFor(identifier) {
  var known = FALLBACK_EXTENSIONS[identifier];
  if (known) return known;
  var type = utTypeFor(identifier);
  if (!type) return null;
  var extension = unwrap(type.preferredFilenameExtension);
  if (!extension || extension.length === 0) return null;
  return String(extension).toLowerCase();
}

function isTransient(identifier) {
  for (var i = 0; i < TRANSIENT_PREFIXES.length; i++) {
    if (identifier.indexOf(TRANSIENT_PREFIXES[i]) === 0) return true;
  }
  return false;
}

function isTextType(identifier) {
  for (var i = 0; i < TEXT_IDENTIFIERS.length; i++) {
    if (identifier === TEXT_IDENTIFIERS[i]) return true;
  }
  return conformsTo(identifier, "public.text");
}

function isImageType(identifier) {
  if (IMAGE_PREFERENCE.indexOf(identifier) !== -1) return true;
  return conformsTo(identifier, "public.image");
}

function firstFileUrl(pasteboard) {
  var urls = pasteboard.readObjectsForClassesOptions($([$.NSURL.class()]), $());
  if (!urls) return null;
  for (var i = 0; i < urls.count; i++) {
    var url = urls.objectAtIndex(i);
    if (unwrap(url.isFileURL)) {
      var path = unwrap(url.path);
      if (path) return path;
    }
  }
  return null;
}

function firstLegacyFilename(pasteboard) {
  var names = pasteboard.propertyListForType("NSFilenamesPboardType");
  if (!names || names.count === 0) return null;
  return unwrap(names.objectAtIndex(0));
}

// A real document (PDF, DOCX, ZIP, ...) beats a rendered image, which beats
// plain text (a copied web page carries the image *and* its URL as text).
function chooseCandidate(documents, images, texts) {
  if (documents.length > 0) return documents[0];
  for (var i = 0; i < IMAGE_PREFERENCE.length; i++) {
    for (var j = 0; j < images.length; j++) {
      if (images[j].identifier === IMAGE_PREFERENCE[i]) return images[j];
    }
  }
  if (images.length > 0) return images[0];
  return texts.length > 0 ? texts[0] : null;
}

// Uncompressed TIFF renderings are needlessly large; re-encode just those.
function writePng(data, outputPath) {
  try {
    var rep = $.NSBitmapImageRep.imageRepWithData(data);
    if (!rep) return false;
    var format = $.NSBitmapImageFileTypePNG === undefined ? $.NSPNGFileType : $.NSBitmapImageFileTypePNG;
    var png = rep.representationUsingTypeProperties(format, $());
    if (!png) return false;
    return png.writeToFileAtomically($(outputPath), true);
  } catch (error) {
    return false;
  }
}

function run(argv) {
  var outputDir = argv[0];
  var pasteboard = $.NSPasteboard.generalPasteboard;

  var existing = firstFileUrl(pasteboard) || firstLegacyFilename(pasteboard);
  if (existing) return existing;

  var types = pasteboard.types;
  var documents = [];
  var images = [];
  var texts = [];

  if (types) {
    for (var i = 0; i < types.count; i++) {
      var identifier = unwrap(types.objectAtIndex(i));
      if (!identifier || isTransient(identifier)) continue;
      if (conformsTo(identifier, "public.file-url")) continue;
      if (conformsTo(identifier, "public.url")) continue;
      var extension = extensionFor(identifier);
      if (!extension) continue;
      var data = pasteboard.dataForType($(identifier));
      if (!data || data.length === 0) continue;
      var candidate = { identifier: identifier, extension: extension, data: data };
      if (isImageType(identifier)) {
        images.push(candidate);
      } else if (isTextType(identifier)) {
        texts.push(candidate);
      } else {
        documents.push(candidate);
      }
    }
  }

  var chosen = chooseCandidate(documents, images, texts);
  if (!chosen) throw new Error("Clipboard does not contain a file.");

  if (chosen.identifier === "public.tiff" && writePng(chosen.data, outputDir + "/clipboard.png")) {
    return outputDir + "/clipboard.png";
  }

  var outputPath = outputDir + "/clipboard." + chosen.extension;
  if (!chosen.data.writeToFileAtomically($(outputPath), true)) {
    throw new Error("Could not write clipboard data to disk.");
  }
  return outputPath;
}
`;

export type OsascriptRunner = (outputDir: string) => Promise<string>;

export interface ExtractedClipboardFile {
  path: string;
  cleanupDir: string;
}

export async function defaultOsascriptRunner(outputDir: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", CLIPBOARD_FILE_SCRIPT, outputDir],
    { timeout: 5000 },
  );
  return stdout.trim();
}

export async function extractClipboardFileToTempFile(
  options: { runOsascript?: OsascriptRunner; platform?: NodeJS.Platform } = {},
): Promise<ExtractedClipboardFile | null> {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") return null;

  const runOsascript = options.runOsascript ?? defaultOsascriptRunner;
  const cleanupDir = await mkdtemp(join(tmpdir(), "raycast-image-uploader-"));

  try {
    const path = await runOsascript(cleanupDir);
    if (!path) throw new Error("Clipboard does not contain a file.");
    return { path, cleanupDir };
  } catch (err) {
    console.error("Failed to extract clipboard contents:", err);
    await rm(cleanupDir, { recursive: true, force: true });
    return null;
  }
}
