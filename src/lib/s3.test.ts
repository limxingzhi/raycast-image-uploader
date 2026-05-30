import { describe, it, expect } from "vitest";

describe("generateKey", () => {
  it("generates a UUID key with png extension for image/png", async () => {
    const { generateKey } = await import("./s3");
    const key = generateKey("image/png");
    expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.png$/);
  });

  it("uses jpeg extension for image/jpeg", async () => {
    const { generateKey } = await import("./s3");
    const key = generateKey("image/jpeg");
    expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.jpeg$/);
  });

  it("defaults to png for unknown mime type", async () => {
    const { generateKey } = await import("./s3");
    const key = generateKey("image/webp");
    expect(key).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.png$/);
  });
});

describe("extensionFromMime", () => {
  it("returns png for image/png", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/png")).toBe("png");
  });

  it("returns jpeg for image/jpeg", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/jpeg")).toBe("jpeg");
  });

  it("returns gif for image/gif", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/gif")).toBe("gif");
  });

  it("returns tiff for image/tiff", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/tiff")).toBe("tiff");
  });

  it("returns png for unknown mime type", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/avif")).toBe("png");
  });
});

describe("buildObjectUrl", () => {
  it("constructs URL from endpoint, bucket, and key", async () => {
    const { buildObjectUrl } = await import("./s3");
    const url = buildObjectUrl("http://100.x.x.x:9000", "my-bucket", "abc.png");
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/abc.png");
  });

  it("strips trailing slash from endpoint", async () => {
    const { buildObjectUrl } = await import("./s3");
    const url = buildObjectUrl(
      "http://100.x.x.x:9000/",
      "my-bucket",
      "abc.png",
    );
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/abc.png");
  });
});
