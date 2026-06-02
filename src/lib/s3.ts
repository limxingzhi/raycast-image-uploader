import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { extensionFromMime } from "./mime";

export function generateKey(mimeType: string): string {
  const ext = extensionFromMime(mimeType);
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
