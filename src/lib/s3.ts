import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import mime from "mime";

export function extensionFromMime(mimeType: string): string {
  return mime.getExtension(mimeType) ?? "bin";
}

export function generateKey(mimeType: string): string {
  const ext = extensionFromMime(mimeType);
  const uuid = randomUUID();
  return `${uuid}.${ext}`;
}

export function buildObjectUrl(
  endpoint: string,
  bucket: string,
  key: string,
): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/${bucket}/${key}`;
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

export async function uploadToS3(
  config: S3Config,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  return performUpload(config, key, body, contentType);
}

async function performUpload(
  config: S3Config,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const client = createS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return buildObjectUrl(config.endpoint, config.bucket, key);
}

export function uploadToS3Optimistic(
  config: S3Config,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): { url: string; upload: Promise<string> } {
  const url = buildObjectUrl(config.endpoint, config.bucket, key);
  const upload = performUpload(config, key, body, contentType);
  return { url, upload };
}
