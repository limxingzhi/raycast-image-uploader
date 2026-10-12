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
});
