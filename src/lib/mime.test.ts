import { describe, it, expect } from "vitest";
import { typeFromExtension, extensionFromMime, typeFromContent, isTextPreviewable } from "./mime";

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
});
