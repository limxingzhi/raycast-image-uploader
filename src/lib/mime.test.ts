import { describe, it, expect } from "vitest";
import { typeFromExtension, extensionFromMime } from "./mime";

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
