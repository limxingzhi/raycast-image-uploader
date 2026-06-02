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
import { fileURLToPath } from "url";
import { typeFromExtension, typeFromContent } from "./lib/mime";
import { generateKey, uploadToS3Optimistic, createS3Client } from "./lib/s3";
import { createHistoryManager } from "./lib/history";

export default function Command() {
  const MAX_PREVIEW_SIZE = 50 * 1024 * 1024; // 50 MB — reject files larger than this
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
      const { file } = await Clipboard.read();
      if (!file) {
        setError("No file found in clipboard");
        return;
      }

      const resolved = fileURLToPath(file);
      setFilePath(resolved);

      const info = await stat(resolved);
      if (info.size > MAX_PREVIEW_SIZE) {
        setError(`File too large (${(info.size / (1024 * 1024)).toFixed(0)} MB). Max preview size is ${MAX_PREVIEW_SIZE / (1024 * 1024)} MB.`);
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
        // Text content — render inline
        const content = data.toString("utf-8");
        const ext = resolved.split("/").pop()?.toLowerCase() || "";
        if (ext === "md" || ext === "markdown") {
          setPreview(content);
        } else if (ext) {
          setPreview(`\`\`\`${ext}\n${content}\n\`\`\``);
        } else {
          setPreview(`\`\`\`\n${content}\n\`\`\``);
        }
      } else {
        setPreview("");
      }

      if (prefs.uploadWithoutAsking) {
        await doUpload(resolved, detected);
      }
    }
    loadPreview();
  }, []);

  const doUpload = useCallback(
    async (path: string, detected: string) => {
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      setIsUploading(true);
      try {
        const key = generateKey(detected);
        const fileData = fileDataRef.current!;

        const { url, upload } = uploadToS3Optimistic(
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

        // Copy URL optimistically — user can try it immediately
        await Clipboard.copy({ text: url });

        // Wait for the actual upload to finish before recording history
        await upload;

        await historyRef.current.add(url, key);
        await showToast({
          style: Toast.Style.Success,
          title: "Uploaded",
          message: url,
        });
        await popToRoot({ clearSearchBar: true });
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
