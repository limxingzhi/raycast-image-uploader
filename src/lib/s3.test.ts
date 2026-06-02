import { describe, it, expect, vi } from "vitest";
import type { S3Config } from "./s3";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

vi.mock("mime", () => ({
  default: {
    getExtension: vi.fn((mimeType: string) => {
      const map: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpeg",
        "image/gif": "gif",
        "image/tiff": "tiff",
        "application/pdf": "pdf",
      };
      return map[mimeType] ?? null;
    }),
  },
}));

describe("generateKey", () => {
  it("generates a UUID key with png extension for image/png", async () => {
    const { generateKey } = await import("./s3");
    const key = generateKey("image/png");
    expect(key).toMatch(/^[0-9a-f-]+\.png$/);
  });

  it("uses jpeg extension for image/jpeg", async () => {
    const { generateKey } = await import("./s3");
    const key = generateKey("image/jpeg");
    expect(key).toMatch(/^[0-9a-f-]+\.jpeg$/);
  });

  it("defaults to bin for unknown mime type", async () => {
    const { generateKey } = await import("./s3");
    const key = generateKey("image/webp");
    expect(key).toMatch(/^[0-9a-f-]+\.bin$/);
  });
});

describe("extensionFromMime", () => {
  it("returns png for image/png", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/png")).toBe("png");
  });

  it("returns pdf for application/pdf", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("application/pdf")).toBe("pdf");
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

  it("returns bin for unknown mime type", async () => {
    const { extensionFromMime } = await import("./s3");
    expect(extensionFromMime("image/avif")).toBe("bin");
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

describe("uploadToS3Optimistic", () => {
  it("returns URL synchronously before upload completes", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockSend = vi.fn().mockResolvedValue({});
    (S3Client as any).mockImplementation(() => ({ send: mockSend }));

    const { uploadToS3Optimistic } = await import("./s3");
    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    const key = "2025/01/01/uuid.png";
    const body = Buffer.from("fake-image-data");

    const result = uploadToS3Optimistic(config, key, body, "image/png");

    // URL is available synchronously — no await needed
    expect(result.url).toBe("http://minio:9000/images/2025/01/01/uuid.png");
    expect(result.upload).toBeInstanceOf(Promise);

    await result.upload;
  });
});
