import { describe, it, expect, vi } from "vitest";

describe("generateKey", () => {
  it("generates a key with date prefix and UUID with png extension for image/png", async () => {
    vi.setSystemTime(new Date("2024-03-15T10:30:00Z"));
    const { generateKey } = await import("./s3");
    const key = generateKey("image/png");
    expect(key).toMatch(/^2024\/03\/15\/[0-9a-f-]+\.png$/);
    vi.useRealTimers();
  });

  it("uses jpeg extension for image/jpeg", async () => {
    vi.setSystemTime(new Date("2024-03-15T10:30:00Z"));
    const { generateKey } = await import("./s3");
    const key = generateKey("image/jpeg");
    expect(key).toMatch(/^2024\/03\/15\/[0-9a-f-]+\.jpeg$/);
    vi.useRealTimers();
  });

  it("defaults to png for unknown mime type", async () => {
    vi.setSystemTime(new Date("2024-03-15T10:30:00Z"));
    const { generateKey } = await import("./s3");
    const key = generateKey("image/webp");
    expect(key).toMatch(/^2024\/03\/15\/[0-9a-f-]+\.png$/);
    vi.useRealTimers();
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
    const url = buildObjectUrl(
      "http://100.x.x.x:9000",
      "my-bucket",
      "2024/03/15/abc.png",
    );
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/2024/03/15/abc.png");
  });

  it("strips trailing slash from endpoint", async () => {
    const { buildObjectUrl } = await import("./s3");
    const url = buildObjectUrl(
      "http://100.x.x.x:9000/",
      "my-bucket",
      "2024/03/15/abc.png",
    );
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/2024/03/15/abc.png");
  });
});
