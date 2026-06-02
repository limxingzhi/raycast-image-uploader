// Comprehensive MIME type lookup — static maps so there are no bundling issues.
// Falls back to application/octet-stream / "bin" for unknown types.

const EXT_TO_MIME: Record<string, string> = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  tif: "image/tiff",
  ico: "image/x-icon",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",

  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  csv: "text/csv",
  tsv: "text/tab-separated-values",

  // Text / Code
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  jsx: "text/jsx",
  ts: "application/typescript",
  tsx: "text/typescript-jsx",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  rtf: "application/rtf",

  // Archives
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  tgz: "application/gzip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  bz2: "application/x-bzip2",
  xz: "application/x-xz",
  zst: "application/zstd",

  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  wma: "audio/x-ms-wma",
  m4a: "audio/mp4",
  opus: "audio/opus",

  // Video
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  webm: "video/webm",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  "3gp": "video/3gpp",

  // Fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",

  // Other
  ics: "text/calendar",
  vcf: "text/vcard",
  exe: "application/x-msdownload",
  dmg: "application/x-apple-diskimage",
  iso: "application/x-iso9660-image",
  bin: "application/octet-stream",
};

const MIME_TO_EXT: Record<string, string> = {};

for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
  if (!MIME_TO_EXT[mime]) {
    MIME_TO_EXT[mime] = ext;
  }
}

// Magic bytes for content-based detection (used when no extension is present)
const MAGIC: Array<{ mime: string; match: (h: Uint8Array) => boolean }> = [
  { mime: "image/png", match: (h) => h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47 },
  { mime: "image/jpeg", match: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { mime: "image/gif", match: (h) => h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x38 },
  { mime: "image/webp", match: (h) => h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50 },
  { mime: "image/tiff", match: (h) => (h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00) || (h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a) },
  { mime: "image/bmp", match: (h) => h[0] === 0x42 && h[1] === 0x4d },
  { mime: "image/heic", match: (h) => {
    const size = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
    return size >= 12 && h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70 && h[8] === 0x68 && h[9] === 0x65 && h[10] === 0x69 && h[11] === 0x63;
  } },
  { mime: "image/avif", match: (h) => {
    const size = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
    return size >= 12 && h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70 && h[8] === 0x61 && h[9] === 0x76 && h[10] === 0x69 && h[11] === 0x66;
  } },
  { mime: "application/pdf", match: (h) => h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46 },
  { mime: "application/zip", match: (h) => h[0] === 0x50 && h[1] === 0x4b && (h[2] === 0x03 || h[2] === 0x05 || h[2] === 0x07) && h[3] === 0x04 },
  { mime: "application/gzip", match: (h) => h[0] === 0x1f && h[1] === 0x8b },
  { mime: "audio/mpeg", match: (h) => h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33 },
  { mime: "audio/wav", match: (h) => h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x41 && h[10] === 0x56 && h[11] === 0x45 },
  { mime: "audio/ogg", match: (h) => h[0] === 0x4f && h[1] === 0x67 && h[2] === 0x67 && h[3] === 0x53 },
  { mime: "video/mp4", match: (h) => {
    const size = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
    return size >= 12 && h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70;
  } },
];

export function typeFromExtension(path: string): string | null {
  const last = path.replace(/^.*[/\\]/, "").toLowerCase();
  const dot = last.lastIndexOf(".");
  if (dot === -1 || dot === last.length - 1) return null;
  const ext = last.slice(dot + 1);
  return EXT_TO_MIME[ext] ?? null;
}

/** Detect MIME type from file content (magic bytes). Returns null if unknown. */
export function typeFromContent(data: Uint8Array): string | null {
  if (data.length < 2) return null;
  for (const entry of MAGIC) {
    if (entry.match(data)) {
      return entry.mime;
    }
  }
  return null;
}

export function extensionFromMime(mimeType: string): string {
  const clean = mimeType.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[clean] ?? "bin";
}
