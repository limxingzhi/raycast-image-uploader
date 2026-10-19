import { describe, expect, it } from "vitest";
import {
  buildFilePreview,
  MAX_INLINE_IMAGE_PREVIEW_SIZE,
} from "./preview";

describe("buildFilePreview", () => {
  it("inlines images below the size cap as a data URI", () => {
    const data = new TextEncoder().encode("not really a png");

    const preview = buildFilePreview(data, "image/png", "/tmp/shot.png");

    expect(preview).toBe(
      `data:image/png;base64,${Buffer.from(data).toString("base64")}`,
    );
  });

  it("does not build a data URI for oversized images", () => {
    const data = new Uint8Array(MAX_INLINE_IMAGE_PREVIEW_SIZE + 1);

    expect(buildFilePreview(data, "image/jpeg", "/tmp/large.jpg")).toBe("");
  });

  it("does not render NUL-free binary types as text", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj");

    expect(buildFilePreview(pdf, "application/pdf", "/tmp/doc.pdf")).toBe("");
  });

  it("renders known text types in a fenced block", () => {
    const data = new TextEncoder().encode("# Title");

    const preview = buildFilePreview(data, "text/markdown", "/tmp/notes.md");

    expect(preview).toBe("```notes.md\n# Title\n```");
  });

  it("previews unknown files when they contain text", () => {
    const data = new TextEncoder().encode("plain words");

    const preview = buildFilePreview(
      data,
      "application/octet-stream",
      "/tmp/notes",
    );

    expect(preview).toBe("```notes\nplain words\n```");
  });

  it("does not preview unknown files containing NUL bytes", () => {
    const data = new TextEncoder().encode("plain\0binary");

    expect(
      buildFilePreview(data, "application/octet-stream", "/tmp/notes"),
    ).toBe("");
  });

  it("does not preview known text types containing NUL bytes", () => {
    const data = new TextEncoder().encode("text\0binary");

    expect(buildFilePreview(data, "text/plain", "/tmp/notes.txt")).toBe("");
  });

  it("returns an empty preview for empty data", () => {
    expect(buildFilePreview(new Uint8Array(), "text/plain", "/tmp/empty")).toBe(
      "",
    );
  });

  it("uses a 5 MB image preview cap", () => {
    expect(MAX_INLINE_IMAGE_PREVIEW_SIZE).toBe(5 * 1024 * 1024);
  });
});
