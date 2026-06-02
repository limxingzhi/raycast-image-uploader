import { describe, it, expect, vi } from "vitest";
import type { S3Config } from "./s3";
import { extensionFromMime } from "./mime";
import { generateKey, buildObjectUrl, uploadToS3Optimistic } from "./s3";
import { S3Client } from "@aws-sdk/client-s3";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

describe("generateKey", () => {
  it("generates a UUID key with png extension for image/png", () => {
    const key = generateKey("image/png");
    expect(key).toMatch(/^[0-9a-f-]+\.png$/);
  });

  it("uses jpg extension for image/jpeg", () => {
    const key = generateKey("image/jpeg");
    expect(key).toMatch(/^[0-9a-f-]+\.jpg$/);
  });

  it("defaults to bin for unknown mime type", () => {
    const key = generateKey("application/vnd.unknown");
    expect(key).toMatch(/^[0-9a-f-]+\.bin$/);
  });
});

describe("extensionFromMime", () => {
  it("returns png for image/png", async () => {
    expect(extensionFromMime("image/png")).toBe("png");
  });

  it("returns pdf for application/pdf", async () => {
    expect(extensionFromMime("application/pdf")).toBe("pdf");
  });

  it("returns jpg for image/jpeg", async () => {
    expect(extensionFromMime("image/jpeg")).toBe("jpg");
  });

  it("returns gif for image/gif", async () => {
    expect(extensionFromMime("image/gif")).toBe("gif");
  });

  it("returns tiff for image/tiff", async () => {
    expect(extensionFromMime("image/tiff")).toBe("tiff");
  });

  it("returns bin for unknown mime type", async () => {
    expect(extensionFromMime("application/vnd.unknown")).toBe("bin");
  });
});

describe("buildObjectUrl", () => {
  it("constructs URL from endpoint, bucket, and key", () => {
    const url = buildObjectUrl("http://100.x.x.x:9000", "my-bucket", "abc.png");
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/abc.png");
  });

  it("strips trailing slash from endpoint", () => {
    const url = buildObjectUrl(
      "http://100.x.x.x:9000/",
      "my-bucket",
      "abc.png",
    );
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/abc.png");
  });

  it("constructs virtual-hosted-style URL when pathStyle is false", () => {
    const url = buildObjectUrl(
      "https://s3.amazonaws.com",
      "my-bucket",
      "abc.png",
      false,
    );
    expect(url).toBe("https://my-bucket.s3.amazonaws.com/abc.png");
  });
});

describe("uploadToS3Optimistic", () => {
  it("returns URL synchronously before upload completes", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as any);

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

  it("accepts a pre-created S3Client for reuse", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const client = new S3Client({});
    client.send = mockSend;

    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    const result = uploadToS3Optimistic(config, "key.png", Buffer.from("data"), "image/png", client);

    expect(result.url).toBe("http://minio:9000/images/key.png");
    await result.upload;
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
