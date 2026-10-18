import { describe, it, expect } from "vitest";
import { clipboardFileToPath } from "./clipboard";

describe("clipboardFileToPath", () => {
  it("returns a plain POSIX path unchanged", () => {
    expect(clipboardFileToPath("/var/folders/xy/T/image.png")).toBe(
      "/var/folders/xy/T/image.png",
    );
  });

  it("returns a relative file name unchanged", () => {
    expect(clipboardFileToPath("image.png")).toBe("image.png");
  });

  it("decodes a file:// URL to a path", () => {
    expect(clipboardFileToPath("file:///var/folders/xy/T/image.png")).toBe(
      "/var/folders/xy/T/image.png",
    );
  });

  it("decodes percent-encoded characters in a file:// URL", () => {
    expect(clipboardFileToPath("file:///Users/me/My%20Images/a.png")).toBe(
      "/Users/me/My Images/a.png",
    );
  });

  it("does not throw on a path that merely contains 'file:'", () => {
    expect(clipboardFileToPath("/tmp/file:copy.png")).toBe("/tmp/file:copy.png");
  });

  it("returns non-file URLs unchanged", () => {
    expect(clipboardFileToPath("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("decodes a file:// URL with a localhost host", () => {
    expect(clipboardFileToPath("file://localhost/Users/me/a.png")).toBe("/Users/me/a.png");
  });

  it("decodes non-ASCII percent-encoded characters", () => {
    expect(clipboardFileToPath("file:///Users/me/caf%C3%A9.png")).toBe("/Users/me/café.png");
  });

  it("decodes an encoded hash in the filename", () => {
    expect(clipboardFileToPath("file:///tmp/a%23b.png")).toBe("/tmp/a#b.png");
  });

  it("returns a Windows path unchanged", () => {
    expect(clipboardFileToPath("C:\\Users\\me\\a.png")).toBe("C:\\Users\\me\\a.png");
  });
});
