/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** S3 Endpoint - URL of your S3-compatible endpoint (e.g. http://100.x.x.x:9000) */
  "s3Endpoint": string,
  /** Bucket Name - S3 bucket name */
  "s3Bucket": string,
  /** Access Key ID - S3 access key */
  "s3AccessKey": string,
  /** Secret Access Key - S3 secret key */
  "s3SecretKey": string,
  /** Upload Without Asking - When enabled, uploads immediately without confirmation */
  "uploadWithoutAsking": boolean,
  /** Recent Image Count - Number of recent uploads to keep in history */
  "recentImageCount": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `upload-image` command */
  export type UploadImage = ExtensionPreferences & {}
  /** Preferences accessible in the `recent-uploads` command */
  export type RecentUploads = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `upload-image` command */
  export type UploadImage = {}
  /** Arguments passed to the `recent-uploads` command */
  export type RecentUploads = {}
}

