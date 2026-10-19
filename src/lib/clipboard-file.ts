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
 * Three stages, each isolated so a failure in one still leaves the others
 * usable: a file already on the pasteboard, then rich payloads, then (last
 * resort) anything AppKit can render.
 *
 * Prints the path of the written file on success and throws otherwise.
 */
export const CLIPBOARD_FILE_SCRIPT = `
ObjC.import("AppKit");
// UniformTypeIdentifiers ships with macOS 11+, and Raycast itself requires
// macOS 11+, so this is always resolvable in practice. The table below only
// exists in case the bridge misbehaves.
try {
  ObjC.import("UniformTypeIdentifiers");
} catch (error) {
  // Fall back to the static extension table.
}

// ObjC bridge values arrive wrapped; bridge failures are treated as absent.
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

// Plain-text UTIs; ranked below documents and images by chooseCandidate.
var TEXT_IDENTIFIERS = [
  "public.utf8-plain-text",
  "public.plain-text",
  "public.utf16-plain-text",
  "com.apple.traditional-mac-plain-text"
];

// Drag, promise, and webarchive types that must never become uploads.
var TRANSIENT_PREFIXES = ["dyn.", "com.apple.pasteboard.", "com.apple.webarchive"];

function utTypeFor(identifier) {
  // UTType is the modern API; if the bridge is missing, fall back to the static table.
  if (!$ || !$.UTType || typeof $.UTType.typeWithIdentifier !== "function") return null;
  try {
    return $.UTType.typeWithIdentifier($(identifier));
  } catch (error) {
    return null;
  }
}

function conformsTo(identifier, supertype) {
  // Asks UTType whether one pasteboard type is a kind of another (e.g. public.image).
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
  // Pinned extension first, then the UTI's preferred extension, otherwise skip.
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

function writeData(data, outputPath) {
  // Atomic write prevents a partially written file from being uploaded.
  try {
    if (!data) return false;
    return !!data.writeToFileAtomically($(outputPath), true);
  } catch (error) {
    return false;
  }
}

// Uncompressed TIFF renderings are needlessly large, and a TIFF payload must
// never be written under a .png name, so re-encode it properly.
function convertToPng(data) {
  try {
    if (!data) return null;
    var rep = $.NSBitmapImageRep.imageRepWithData(data);
    if (!rep) return null;
    var format = $.NSBitmapImageFileTypePNG === undefined ? $.NSPNGFileType : $.NSBitmapImageFileTypePNG;
    return rep.representationUsingTypeProperties(format, $());
  } catch (error) {
    return null;
  }
}

function writePng(data, outputPath, convert) {
  // Return null instead of throwing so the caller can try another stage.
  try {
    var png = convert ? convertToPng(data) : data;
    return writeData(png, outputPath) ? outputPath : null;
  } catch (error) {
    return null;
  }
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

function pickPayload(pasteboard) {
  var documents = [];
  var images = [];
  var texts = [];
  var types = pasteboard.types;
  if (!types) return null;

  for (var i = 0; i < types.count; i++) {
    var identifier = unwrap(types.objectAtIndex(i));
    // File references and plain URLs are resolved by the other two stages.
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

  return chooseCandidate(documents, images, texts);
}

// A file is already on the pasteboard: a Finder copy, a drag, or a promised
// file that AppKit has just materialised for us.
function tryExistingFile(pasteboard) {
  try {
    var urls = pasteboard.readObjectsForClassesOptions($([$.NSURL.class()]), $());
    if (urls) {
      for (var i = 0; i < urls.count; i++) {
        var url = urls.objectAtIndex(i);
        if (unwrap(url.isFileURL)) {
          var path = unwrap(url.path);
          if (path) return path;
        }
      }
    }
    var names = pasteboard.propertyListForType("NSFilenamesPboardType");
    if (names && names.count > 0) {
      var legacy = unwrap(names.objectAtIndex(0));
      if (legacy) return legacy;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function tryPayload(pasteboard, outputDir) {
  var chosen;
  try {
    chosen = pickPayload(pasteboard);
  } catch (error) {
    return null;
  }
  if (!chosen) return null;

  if (chosen.identifier === "public.tiff") {
    // Raw TIFF is needlessly large, so re-encode it before writing.
    var asPng = writePng(chosen.data, outputDir + "/clipboard.png", true);
    if (asPng) return asPng;
  }

  var outputPath = outputDir + "/clipboard." + chosen.extension;
  if (!writeData(chosen.data, outputPath)) {
    // Return null so the rasterize fallback still gets a chance.
    return null;
  }
  return outputPath;
}

// Last resort: let AppKit render image data we could not identify, so a
// screenshot or bitmap copy always has something to upload.
function tryRasterize(pasteboard, outputDir) {
  try {
    var images = pasteboard.readObjectsForClassesOptions($([$.NSImage.class()]), $());
    if (!images || images.count === 0) return null;
    var image = images.objectAtIndex(0);
    if (!image) return null;
    return writePng(image.TIFFRepresentation, outputDir + "/clipboard.png", true);
  } catch (error) {
    return null;
  }
}

function run(argv) {
  var outputDir = argv[0];
  var pasteboard = $.NSPasteboard.generalPasteboard;
  var written;

  // Try each stage in order; the final throw only fires when all three fail.
  written = tryExistingFile(pasteboard);
  if (written) return written;

  written = tryPayload(pasteboard, outputDir);
  if (written) return written;

  written = tryRasterize(pasteboard, outputDir);
  if (written) return written;

  throw new Error("Clipboard does not contain a file.");
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
    // 5 s timeout keeps a hung pasteboard from freezing the command.
    { timeout: 5000 },
  );
  return stdout.trim();
}

export async function extractClipboardFileToTempFile(
  options: { runOsascript?: OsascriptRunner; platform?: NodeJS.Platform } = {},
): Promise<ExtractedClipboardFile | null> {
  const platform = options.platform ?? process.platform;
  // Pasteboard access via osascript only exists on macOS.
  if (platform !== "darwin") return null;

  const runOsascript = options.runOsascript ?? defaultOsascriptRunner;
  const cleanupDir = await mkdtemp(join(tmpdir(), "raycast-image-uploader-"));

  try {
    const path = await runOsascript(cleanupDir);
    if (!path) throw new Error("Clipboard does not contain a file.");
    return { path, cleanupDir };
  } catch (err) {
    console.error("Failed to extract clipboard contents:", err);
    // Clean up partial output so failed extractions do not leave temp files behind.
    await rm(cleanupDir, { recursive: true, force: true });
    return null;
  }
}
