import { describe, it, expect } from "vitest";
import {
  typeFromExtension,
  extensionFromMime,
  extensionFromPath,
  typeFromContent,
  isTextPreviewable,
} from "./mime";

describe("typeFromExtension", () => {
  it("returns image/png for .png path", () => {
    expect(typeFromExtension("photo.png")).toBe("image/png");
  });

  it("returns image/png for full path", () => {
    expect(typeFromExtension("/Users/test/photo.png")).toBe("image/png");
  });

  it("returns image/jpeg for .jpg", () => {
    expect(typeFromExtension("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(typeFromExtension("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns application/pdf for .pdf", () => {
    expect(typeFromExtension("doc.pdf")).toBe("application/pdf");
  });

  it("returns application/zip for .zip", () => {
    expect(typeFromExtension("archive.zip")).toBe("application/zip");
  });

  it("returns text/plain for .txt", () => {
    expect(typeFromExtension("notes.txt")).toBe("text/plain");
  });

  it("returns null for path with no extension", () => {
    expect(typeFromExtension("Makefile")).toBeNull();
  });

  it("returns null for path ending in dot", () => {
    expect(typeFromExtension("file.")).toBeNull();
  });

  it("handles uppercase extension", () => {
    expect(typeFromExtension("photo.PNG")).toBe("image/png");
  });

  it("returns null for unknown extension", () => {
    expect(typeFromExtension("file.xyz")).toBeNull();
  });

  it("maps common document, code, media, archive, and font extensions", () => {
    const cases: Array<[string, string]> = [
      ["report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["data.csv", "text/csv"],
      ["README.md", "text/markdown"],
      ["app.js", "application/javascript"],
      ["main.ts", "application/typescript"],
      ["config.json", "application/json"],
      ["config.yaml", "application/yaml"],
      ["photo.webp", "image/webp"],
      ["photo.heic", "image/heic"],
      ["track.mp3", "audio/mpeg"],
      ["movie.mp4", "video/mp4"],
      ["font.woff2", "font/woff2"],
      ["archive.7z", "application/x-7z-compressed"],
    ];

    for (const [path, mime] of cases) {
      expect(typeFromExtension(path)).toBe(mime);
    }
  });
});

describe("extensionFromPath", () => {
  it("returns the lowercase extension of a bare filename", () => {
    expect(extensionFromPath("photo.PNG")).toBe("png");
  });

  it("returns the extension of a full path", () => {
    expect(extensionFromPath("/Users/test/Downloads/report.pdf")).toBe("pdf");
  });

  it("returns an extension that has no MIME mapping", () => {
    expect(extensionFromPath("artwork.psd")).toBe("psd");
  });

  it("returns null for a path with no extension", () => {
    expect(extensionFromPath("Makefile")).toBeNull();
  });

  it("returns null for a path ending in a dot", () => {
    expect(extensionFromPath("file.")).toBeNull();
  });

  it("handles a Windows-style path", () => {
    expect(extensionFromPath("C:\\Users\\me\\photo.PNG")).toBe("png");
  });

  it("returns only the final extension for multi-dot names", () => {
    expect(extensionFromPath("archive.tar.gz")).toBe("gz");
  });

  it("ignores dots in directory names", () => {
    expect(extensionFromPath("/Users/me.dir/photo")).toBeNull();
  });
});

describe("extensionFromMime", () => {
  it("returns png for image/png", () => {
    expect(extensionFromMime("image/png")).toBe("png");
  });

  it("returns jpg for image/jpeg", () => {
    expect(extensionFromMime("image/jpeg")).toBe("jpg");
  });

  it("returns pdf for application/pdf", () => {
    expect(extensionFromMime("application/pdf")).toBe("pdf");
  });

  it("returns bin for unknown MIME type", () => {
    expect(extensionFromMime("application/vnd.unknown")).toBe("bin");
  });

  it("returns bin for application/octet-stream", () => {
    expect(extensionFromMime("application/octet-stream")).toBe("bin");
  });

  it("returns bin as ultimate fallback for garbage", () => {
    expect(extensionFromMime("garbage")).toBe("bin");
  });

  it("strips parameters from MIME type", () => {
    expect(extensionFromMime("image/png; charset=utf-8")).toBe("png");
  });

  it("lowercases the MIME type before lookup", () => {
    expect(extensionFromMime("IMAGE/PNG")).toBe("png");
  });

  it("maps common non-image MIME types", () => {
    expect(extensionFromMime("text/html")).toBe("html");
    expect(extensionFromMime("application/javascript")).toBe("js");
    expect(extensionFromMime("application/yaml")).toBe("yaml");
    expect(extensionFromMime("audio/mp4")).toBe("m4a");
    expect(extensionFromMime("font/woff2")).toBe("woff2");
    expect(extensionFromMime("text/typescript-jsx")).toBe("tsx");
  });
});

describe("typeFromContent", () => {
  it("detects PNG from magic bytes", () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(typeFromContent(buf)).toBe("image/png");
  });

  it("detects JPEG from magic bytes", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(typeFromContent(buf)).toBe("image/jpeg");
  });

  it("detects GIF from magic bytes", () => {
    const buf = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(typeFromContent(buf)).toBe("image/gif");
  });

  it("detects PDF from magic bytes", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    expect(typeFromContent(buf)).toBe("application/pdf");
  });

  it("detects ZIP from magic bytes", () => {
    const buf = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(typeFromContent(buf)).toBe("application/zip");
  });

  it("detects GZIP from magic bytes", () => {
    const buf = new Uint8Array([0x1f, 0x8b]);
    expect(typeFromContent(buf)).toBe("application/gzip");
  });

  it("returns null for unsupported content", () => {
    const buf = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(typeFromContent(buf)).toBeNull();
  });

  it("returns null for empty buffer", () => {
    expect(typeFromContent(new Uint8Array([]))).toBeNull();
  });

  it("does not false-positive HEIC when RIFF box size is invalid", () => {
    // Bytes 4-11 match "ftypheic" but bytes 0-3 are too small to be a valid box
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(typeFromContent(buf)).toBeNull();
  });

  it("does not false-positive AVIF when RIFF box size is invalid", () => {
    // Bytes 4-11 match "ftypavif" but bytes 0-3 are too small to be a valid box
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    expect(typeFromContent(buf)).toBeNull();
  });

  it("detects WebP from magic bytes", () => {
    const buf = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(typeFromContent(buf)).toBe("image/webp");
  });

  it("detects little- and big-endian TIFF from magic bytes", () => {
    expect(typeFromContent(new Uint8Array([0x49, 0x49, 0x2a, 0x00]))).toBe("image/tiff");
    expect(typeFromContent(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]))).toBe("image/tiff");
  });

  it("detects BMP from magic bytes", () => {
    expect(typeFromContent(new Uint8Array([0x42, 0x4d]))).toBe("image/bmp");
  });

  it("detects HEIC from a valid ftyp box", () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(typeFromContent(buf)).toBe("image/heic");
  });

  it("detects AVIF from a valid ftyp box", () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    expect(typeFromContent(buf)).toBe("image/avif");
  });

  it("detects MP3 from an ID3 tag", () => {
    expect(typeFromContent(new Uint8Array([0x49, 0x44, 0x33]))).toBe("audio/mpeg");
  });

  it("detects WAV from magic bytes", () => {
    const buf = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    expect(typeFromContent(buf)).toBe("audio/wav");
  });

  it("detects OGG from magic bytes", () => {
    expect(typeFromContent(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe("audio/ogg");
  });

  it("detects MP4 from a valid ftyp box", () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(typeFromContent(buf)).toBe("video/mp4");
  });

  it("returns null for a single-byte buffer", () => {
    expect(typeFromContent(new Uint8Array([0x89]))).toBeNull();
  });
});

describe("isTextPreviewable", () => {
  it("returns true for text/plain", () => {
    expect(isTextPreviewable("text/plain")).toBe(true);
  });

  it("returns true for text/html", () => {
    expect(isTextPreviewable("text/html")).toBe(true);
  });

  it("returns true for application/json", () => {
    expect(isTextPreviewable("application/json")).toBe(true);
  });

  it("returns true for application/javascript", () => {
    expect(isTextPreviewable("application/javascript")).toBe(true);
  });

  it("returns true for application/typescript", () => {
    expect(isTextPreviewable("application/typescript")).toBe(true);
  });

  it("returns true for text/jsx", () => {
    expect(isTextPreviewable("text/jsx")).toBe(true);
  });

  it("returns false for application/pdf", () => {
    expect(isTextPreviewable("application/pdf")).toBe(false);
  });

  it("returns false for application/zip", () => {
    expect(isTextPreviewable("application/zip")).toBe(false);
  });

  it("returns false for image/png", () => {
    expect(isTextPreviewable("image/png")).toBe(false);
  });

  it("returns false for audio/mpeg", () => {
    expect(isTextPreviewable("audio/mpeg")).toBe(false);
  });

  it("returns false for video/mp4", () => {
    expect(isTextPreviewable("video/mp4")).toBe(false);
  });

  it("returns true for other structured text types", () => {
    for (const mime of [
      "text/csv",
      "text/typescript-jsx",
      "application/xml",
      "application/yaml",
      "application/toml",
    ]) {
      expect(isTextPreviewable(mime)).toBe(true);
    }
  });

  it("returns false for document and binary types", () => {
    for (const mime of [
      "application/msword",
      "application/octet-stream",
      "font/woff2",
    ]) {
      expect(isTextPreviewable(mime)).toBe(false);
    }
  });
});
