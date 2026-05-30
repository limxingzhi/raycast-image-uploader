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
import { useState, useEffect, useCallback } from "react";
import { readFile } from "fs/promises";
import { extname } from "path";
import fileUriToPath from "file-uri-to-path";
import { generateKey, uploadToS3 } from "./lib/s3";
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
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");

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
      setIsUploading(true);
      try {
        const key = generateKey(mime);
        const fileData = await readFile(path);
        const url = await uploadToS3(
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
        await history.add(url, key.split("/").pop() ?? key);

        await popToRoot({ clearSearchBar: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await showToast({
          style: Toast.Style.Failure,
          title: "Upload failed",
          message,
        });
      } finally {
        setIsUploading(false);
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

  return (
    <Detail
      isLoading={isUploading}
      markdown={preview ? `![Preview](${preview})` : ""}
      actions={
        <ActionPanel>
          <Action title="Upload" icon={Icon.Upload} onAction={handleUpload} />
        </ActionPanel>
      }
    />
  );
}
