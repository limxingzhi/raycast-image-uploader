import {
  Clipboard,
  showToast,
  Toast,
  getPreferenceValues,
  Detail,
  Action,
  ActionPanel,
  popToRoot,
  LocalStorage,
  Icon,
} from "@raycast/api";
import { useState, useEffect, useCallback, useRef } from "react";
import { readFile, stat } from "fs/promises";
import { extname } from "path";
import fileUriToPath from "file-uri-to-path";
import { generateKey, uploadToS3Optimistic } from "./lib/s3";
import { createHistoryManager } from "./lib/history";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

interface Preferences {
  s3Endpoint: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  uploadWithoutAsking: boolean;
  recentImageCount: string;
}

export default function Command() {
  const [preview, setPreview] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("image/png");
  const [fileSize, setFileSize] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");

  const uploadingRef = useRef(false);
  const prefs = getPreferenceValues<Preferences>();
  const recentCount = parseInt(prefs.recentImageCount, 10) || 50;

  useEffect(() => {
    async function loadPreview() {
      const { file } = await Clipboard.read();
      if (!file) {
        setError("No image found in clipboard");
        return;
      }

      const resolved = fileUriToPath(file);
      const ext = extname(resolved).toLowerCase();
      const mime = MIME_MAP[ext] ?? "image/png";
      setFilePath(resolved);
      setMimeType(mime);

      const info = await stat(resolved);
      const size =
        info.size < 1024 * 1024
          ? `${(info.size / 1024).toFixed(1)} KB`
          : `${(info.size / (1024 * 1024)).toFixed(1)} MB`;
      setFileSize(size);

      const data = await readFile(resolved);
      const base64 = data.toString("base64");
      setPreview(`data:${mime};base64,${base64}`);

      if (prefs.uploadWithoutAsking) {
        await doUpload(resolved, mime);
      }
    }
    loadPreview();
  }, []);

  const doUpload = useCallback(
    async (path: string, mime: string) => {
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      setIsUploading(true);
      try {
        const key = generateKey(mime);
        const fileData = await readFile(path);

        const { url, upload } = uploadToS3Optimistic(
          {
            endpoint: prefs.s3Endpoint,
            bucket: prefs.s3Bucket,
            accessKeyId: prefs.s3AccessKey,
            secretAccessKey: prefs.s3SecretKey,
          },
          key,
          fileData,
          mime,
        );

        await Clipboard.copy({ text: url });
        await showToast({
          style: Toast.Style.Success,
          title: "URL copied to clipboard",
          message: url,
        });

        const history = createHistoryManager(
          {
            getItem: (k) => LocalStorage.getItem<string>(k),
            setItem: (k, v) => LocalStorage.setItem(k, v),
          },
          recentCount,
        );
        await history.add(url, key);
        await popToRoot({ clearSearchBar: true });

        // Background upload — catch errors so they don't go unhandled
        upload.catch(async (err) => {
          const message = err instanceof Error ? err.message : String(err);
          await showToast({
            style: Toast.Style.Failure,
            title: "Upload failed",
            message,
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await showToast({
          style: Toast.Style.Failure,
          title: "Upload failed",
          message,
        });
      } finally {
        uploadingRef.current = false;
      }
    },
    [prefs, recentCount],
  );

  const handleUpload = useCallback(() => {
    doUpload(filePath, mimeType);
  }, [doUpload, filePath, mimeType]);

  if (error) {
    return <Detail markdown={`**${error}**`} />;
  }

  const markdown = preview ? `![Preview](${preview})` : "";

  return (
    <Detail
      navigationTitle="Upload Image"
      isLoading={isUploading}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Filename"
            text={filePath.split("/").pop() ?? ""}
          />
          <Detail.Metadata.Label title="Size" text={fileSize} />
          <Detail.Metadata.Label title="Type" text={mimeType} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {!isUploading && <Action title="Upload" icon={Icon.Upload} onAction={handleUpload} />}
        </ActionPanel>
      }
    />
  );
}
