import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { extensionFromMime } from "./mime";

/**
 * Builds a `{uuid}.{ext}` object key. `sourceExtension` (from the original file
 * path) wins when it is a sane extension, so files whose type is not in the MIME
 * table keep their real extension instead of becoming `.bin`.
 */
export function generateKey(
  mimeType: string,
  sourceExtension?: string | null,
): string {
  const sanitized = sourceExtension?.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const ext = sanitized ? sanitized : extensionFromMime(mimeType);
  const uuid = randomUUID();
  return `${uuid}.${ext}`;
}

export function buildObjectUrl(
  endpoint: string,
  bucket: string,
  key: string,
  pathStyle = true,
): string {
  const base = endpoint.replace(/\/+$/, "");
  return pathStyle
    ? `${base}/${bucket}/${key}`
    : `${base.replace("://", `://${bucket}.`)}/${key}`;
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

async function performUpload(
  config: S3Config,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  client?: S3Client,
): Promise<string> {
  const s3 = client ?? createS3Client(config);
  await s3.send(
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
  client?: S3Client,
): { url: string; upload: Promise<string> } {
  const url = buildObjectUrl(config.endpoint, config.bucket, key);
  const upload = performUpload(config, key, body, contentType, client);
  return { url, upload };
}
