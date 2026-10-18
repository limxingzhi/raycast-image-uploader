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
import { readFile, rm, stat } from "fs/promises";
import { typeFromExtension, typeFromContent, extensionFromPath } from "./lib/mime";
import { clipboardFileToPath } from "./lib/clipboard";
import { extractClipboardFileToTempFile } from "./lib/clipboard-file";
import { generateKey, uploadToS3, createS3Client } from "./lib/s3";
import { createHistoryManager } from "./lib/history";

export default function Command() {
  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB — reject files larger than this
  const [preview, setPreview] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("application/octet-stream");
  const [fileSize, setFileSize] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");

  const uploadingRef = useRef(false);
  const fileDataRef = useRef<Buffer | null>(null);
  const prefs = getPreferenceValues<Preferences.UploadImage>();
  const recentCount = parseInt(prefs.recentImageCount, 10) || 50;
  const s3ClientRef = useRef(createS3Client({
    endpoint: prefs.s3Endpoint,
    bucket: prefs.s3Bucket,
    accessKeyId: prefs.s3AccessKey,
    secretAccessKey: prefs.s3SecretKey,
  }));
  const historyRef = useRef(createHistoryManager(
    {
      getItem: (k) => LocalStorage.getItem<string>(k),
      setItem: (k, v) => LocalStorage.setItem(k, v),
    },
    recentCount,
  ));

  useEffect(() => {
    async function loadPreview() {
      if (prefs.s3Endpoint.startsWith("http://")) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Warning: HTTP endpoint",
          message: "Credentials and files transmitted in plaintext. Use HTTPS in production.",
        });
      }

      const { file } = await Clipboard.read();
      let resolved: string;
      let cleanupDir: string | undefined;

      if (file) {
        resolved = clipboardFileToPath(file);
      } else {
        const extracted = await extractClipboardFileToTempFile();
        if (!extracted) {
          setError("No file found in clipboard. Copy a file, image, or take a screenshot first.");
          return;
        }
        resolved = extracted.path;
        cleanupDir = extracted.cleanupDir;
      }

      try {
        setFilePath(resolved);

        const info = await stat(resolved);
        if (info.size > MAX_UPLOAD_SIZE) {
          setError(`File too large (${(info.size / (1024 * 1024)).toFixed(0)} MB). Max upload size is ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB.`);
          return;
        }
        const size =
          info.size < 1024 * 1024
            ? `${(info.size / 1024).toFixed(1)} KB`
            : `${(info.size / (1024 * 1024)).toFixed(1)} MB`;
        setFileSize(size);

        const data = await readFile(resolved);
        fileDataRef.current = data;

        const detected =
          typeFromExtension(resolved) ?? typeFromContent(new Uint8Array(data)) ?? "application/octet-stream";
        setMimeType(detected);

        if (detected.startsWith("image/")) {
          const base64 = data.toString("base64");
          setPreview(`data:${detected};base64,${base64}`);
        } else if (!data.includes(0) && data.length > 0) {
          // Text content — render in code fence to prevent markdown injection
          const content = data.toString("utf-8");
          const ext = resolved.split("/").pop()?.toLowerCase() || "";
          setPreview(`\`\`\`${ext}\n${content}\n\`\`\``);
        } else {
          setPreview("");
        }

        if (prefs.uploadWithoutAsking) {
          await doUpload(resolved, detected);
        }
      } finally {
        if (cleanupDir) {
          await rm(cleanupDir, { recursive: true, force: true });
        }
      }
    }
    loadPreview().catch((err) => {
      console.error("Failed to read clipboard file:", err);
      setError("Could not read the clipboard file.");
    });
  }, []);

  const doUpload = useCallback(
    async (path: string, detected: string) => {
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      setIsUploading(true);
      try {
        const key = generateKey(detected, extensionFromPath(path));
        const fileData = fileDataRef.current!;

        const url = await uploadToS3(
          {
            endpoint: prefs.s3Endpoint,
            bucket: prefs.s3Bucket,
            accessKeyId: prefs.s3AccessKey,
            secretAccessKey: prefs.s3SecretKey,
          },
          key,
          fileData,
          detected,
          s3ClientRef.current,
        );

        fileDataRef.current = null;

        // Only publish the URL once the object exists in S3.
        await Clipboard.copy({ text: url });
        await historyRef.current.add(url, key);
        await showToast({
          style: Toast.Style.Success,
          title: "Uploaded",
          message: url,
        });
        await popToRoot({ clearSearchBar: true });
      } catch (err) {
        console.error("Upload failed:", err);
        fileDataRef.current = null;
        await showToast({
          style: Toast.Style.Failure,
          title: "Upload failed",
          message: "Check your S3 configuration and try again.",
        });
      } finally {
        uploadingRef.current = false;
      }
    },
    [prefs],
  );

  const handleUpload = useCallback(async () => {
    await doUpload(filePath, mimeType);
  }, [doUpload, filePath, mimeType]);

  if (error) {
    return <Detail markdown={`**${error}**`} />;
  }

  const markdown = !preview
    ? `# ${filePath.split("/").pop() || "File"}\n\n**Type:** ${mimeType}  \n**Size:** ${fileSize}`
    : preview.startsWith("data:")
      ? `![Preview](${preview})`
      : preview;

  return (
    <Detail
      navigationTitle="Upload File"
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
