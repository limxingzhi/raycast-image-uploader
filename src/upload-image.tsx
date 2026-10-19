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
import { resolveRecentCount } from "./lib/recent-count";

export default function Command() {
  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB — reject files larger than this
  const [preview, setPreview] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("application/octet-stream");
  const [fileSize, setFileSize] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // True until the clipboard payload is resolved or fails.
  const [isReady, setIsReady] = useState(false); // True once bytes are in memory and uploading is safe.
  const [error, setError] = useState<string>("");

  const mountedRef = useRef(true); // Guards state updates after popToRoot unmounts the command.
  const uploadingRef = useRef(false); // Synchronous guard; state updates too late to stop a double Enter.
  const fileDataRef = useRef<Buffer | null>(null); // Survives failures so a retry reuses the same bytes.
  const prefs = getPreferenceValues<Preferences.UploadImage>();
  const recentCount = resolveRecentCount(prefs.recentImageCount);
  const s3ClientRef = useRef(createS3Client({
    endpoint: prefs.s3Endpoint,
    bucket: prefs.s3Bucket,
    accessKeyId: prefs.s3AccessKey,
    secretAccessKey: prefs.s3SecretKey,
  })); // Reused across uploads so each PUT does not pay for a new TLS handshake.
  const historyRef = useRef(createHistoryManager(
    {
      getItem: (k) => LocalStorage.getItem<string>(k),
      setItem: (k, v) => LocalStorage.setItem(k, v),
    },
    recentCount,
  )); // The real LocalStorage adapter is injected here; tests pass a mock instead.

  useEffect(() => {
    mountedRef.current = true;

    // Resolve the clipboard payload once, when the command opens.
    async function loadPreview() {
      if (prefs.s3Endpoint.startsWith("http://")) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Warning: HTTP endpoint",
          message: "Credentials and files transmitted in plaintext. Use HTTPS in production.",
        });
      }

      try {
        // A `file` is present only when the clipboard references something on disk.
        const { file } = await Clipboard.read();
        let resolved: string;
        let cleanupDir: string | undefined;

        if (file) {
          resolved = clipboardFileToPath(file);
        } else {
          // Screenshots and copied file contents are pasteboard data, not file URLs.
          const extracted = await extractClipboardFileToTempFile();
          if (!extracted) {
            setError("No file found in clipboard. Copy a file, image, or take a screenshot first.");
            return;
          }
          resolved = extracted.path;
          cleanupDir = extracted.cleanupDir;
        }

        try {
          // Publish the path early so the Detail view has a filename while loading.
          setFilePath(resolved);

          // Reject oversized files before reading them fully into memory.
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
          setIsReady(true); // The Upload action can now safely send these bytes.

          // A mapped extension wins; otherwise sniff the first bytes of the file.
          const detected =
            typeFromExtension(resolved) ?? typeFromContent(new Uint8Array(data)) ?? "application/octet-stream";
          setMimeType(detected);

          if (detected.startsWith("image/")) {
            // Inline data URI so the Detail view can render the image itself.
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
            // Skip the confirmation UI and upload as soon as the payload is ready.
            await doUpload(resolved, detected);
          }
        } finally {
          // Only temp dirs created by the extractor need cleanup.
          if (cleanupDir) {
            await rm(cleanupDir, { recursive: true, force: true });
          }
        }
      } finally {
        // Stop the spinner on success, failure, and every early return above.
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    }
    loadPreview().catch((err) => {
      console.error("Failed to read clipboard file:", err);
      if (mountedRef.current) {
        setError("Could not read the clipboard file.");
      }
    });

    return () => {
      // Ignore late state updates once the command has gone away.
      mountedRef.current = false;
    };
  }, []);

  const doUpload = useCallback(
    async (path: string, detected: string) => {
      if (uploadingRef.current) return; // A second Enter while the PUT is in flight is a no-op.

      const fileData = fileDataRef.current;
      if (!fileData) {
        // The action is hidden until ready, so this only guards programmatic callers.
        await showToast({
          style: Toast.Style.Failure,
          title: "Upload failed",
          message: "The clipboard file is not ready yet.",
        });
        return;
      }

      uploadingRef.current = true;
      setIsUploading(true);
      try {
        // Keep the source extension when usable, otherwise derive it from the MIME type.
        const key = generateKey(detected, extensionFromPath(path));

        // Resolves with the public URL only after the object is stored.
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

        fileDataRef.current = null; // Release the buffer; the bytes are safely in S3.

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
        // Toast stays generic so screenshots cannot leak endpoints or key IDs.
        await showToast({
          style: Toast.Style.Failure,
          title: "Upload failed",
          message: "Check your S3 configuration and try again.",
        });
      } finally {
        // The buffer is intentionally kept on failure so the user can retry.
        uploadingRef.current = false;
        if (mountedRef.current) {
          setIsUploading(false);
        }
      }
    },
    [prefs],
  );

  const handleUpload = useCallback(async () => {
    await doUpload(filePath, mimeType);
  }, [doUpload, filePath, mimeType]);

  if (error) {
    // Nothing usable was loaded; show the reason instead of an empty Detail view.
    return <Detail markdown={`**${error}**`} />;
  }

  // Fall back to filename/type/size when there is no inline preview.
  const markdown = !preview
    ? `# ${filePath.split("/").pop() || "File"}\n\n**Type:** ${mimeType}  \n**Size:** ${fileSize}`
    : preview.startsWith("data:")
      ? `![Preview](${preview})`
      : preview;

  return (
    <Detail
      navigationTitle="Upload File"
      isLoading={isLoading || isUploading}
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
          {/* Hidden until the buffer exists so Enter cannot send an empty body. */}
          {isReady && !isUploading && <Action title="Upload" icon={Icon.Upload} onAction={handleUpload} />}
        </ActionPanel>
      }
    />
  );
}
