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

export function typeFromExtension(path: string): string | null {
  const last = path.replace(/^.*[/\\]/, "").toLowerCase();
  const dot = last.lastIndexOf(".");
  if (dot === -1 || dot === last.length - 1) return null;
  const ext = last.slice(dot + 1);
  return EXT_TO_MIME[ext] ?? null;
}

export function extensionFromMime(mimeType: string): string {
  const clean = mimeType.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[clean] ?? "bin";
}
