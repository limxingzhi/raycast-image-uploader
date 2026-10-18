import { describe, it, expect, vi } from "vitest";
import type { S3Config } from "./s3";
import { extensionFromMime } from "./mime";
import { generateKey, buildObjectUrl, uploadToS3, createS3Client } from "./s3";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

  it("keeps the source extension for types missing from the MIME table", () => {
    const key = generateKey("application/octet-stream", "psd");
    expect(key).toMatch(/^[0-9a-f-]+\.psd$/);
  });

  it("prefers the source extension over the MIME-derived one", () => {
    const key = generateKey("application/pdf", "pdf");
    expect(key).toMatch(/^[0-9a-f-]+\.pdf$/);
  });

  it("sanitizes an unsafe source extension", () => {
    const key = generateKey("application/octet-stream", "psd/../etc");
    expect(key).toMatch(/^[0-9a-f-]+\.psdetc$/);
  });

  it("ignores an empty source extension", () => {
    const key = generateKey("image/png", "");
    expect(key).toMatch(/^[0-9a-f-]+\.png$/);
  });

  it("generates a different key for every call", () => {
    expect(generateKey("image/png")).not.toBe(generateKey("image/png"));
  });

  it("lowercases the source extension", () => {
    const key = generateKey("image/png", "PNG");
    expect(key).toMatch(/^[0-9a-f-]+\.png$/);
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

  it("strips multiple trailing slashes from the endpoint", () => {
    const url = buildObjectUrl("http://100.x.x.x:9000///", "my-bucket", "abc.png");
    expect(url).toBe("http://100.x.x.x:9000/my-bucket/abc.png");
  });

  it("preserves a path prefix on the endpoint", () => {
    const url = buildObjectUrl("https://example.com/storage/", "my-bucket", "abc.png");
    expect(url).toBe("https://example.com/storage/my-bucket/abc.png");
  });

  it("keeps the port in a virtual-hosted-style URL", () => {
    const url = buildObjectUrl("http://localhost:9000", "my-bucket", "abc.png", false);
    expect(url).toBe("http://my-bucket.localhost:9000/abc.png");
  });
});

describe("uploadToS3", () => {
  it("returns the URL only after the upload completes", async () => {
    let resolveSend: (value: unknown) => void = () => {};
    const mockSend = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);

    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    const key = "2025/01/01/uuid.png";
    const body = Buffer.from("fake-image-data");

    let settled = false;
    const result = uploadToS3(config, key, body, "image/png");
    result.finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveSend({});
    await expect(result).resolves.toBe("http://minio:9000/images/2025/01/01/uuid.png");
  });

  it("rejects instead of returning a URL when the upload fails", async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error("access denied"));
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);

    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };

    await expect(uploadToS3(config, "key.png", Buffer.from("data"), "image/png")).rejects.toThrow(
      "access denied",
    );
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

    await expect(
      uploadToS3(config, "key.png", Buffer.from("data"), "image/png", client),
    ).resolves.toBe("http://minio:9000/images/key.png");
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("sends bucket, key, body, and content type with the PUT", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);
    vi.mocked(PutObjectCommand).mockClear();

    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    const body = Buffer.from("document-data");

    await uploadToS3(config, "key.pdf", body, "application/pdf");

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: "images",
      Key: "key.pdf",
      Body: body,
      ContentType: "application/pdf",
    });
  });

  it("creates a client when none is provided", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);
    vi.mocked(S3Client).mockClear();

    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };

    await uploadToS3(config, "key.png", Buffer.from("data"), "image/png");

    expect(S3Client).toHaveBeenCalledOnce();
  });

  it("does not create a client when one is provided", async () => {
    const client = new S3Client({});
    client.send = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockClear();

    const config: S3Config = {
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };

    await uploadToS3(config, "key.png", Buffer.from("data"), "image/png", client);

    expect(S3Client).not.toHaveBeenCalled();
  });
});

describe("createS3Client", () => {
  it("configures path-style access and static credentials", () => {
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);
    vi.mocked(S3Client).mockClear();

    createS3Client({
      endpoint: "http://minio:9000",
      bucket: "images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });

    expect(S3Client).toHaveBeenCalledWith({
      endpoint: "http://minio:9000",
      region: "us-east-1",
      credentials: {
        accessKeyId: "key",
        secretAccessKey: "secret",
      },
      forcePathStyle: true,
    });
  });
});
