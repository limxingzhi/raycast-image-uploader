import { isTextPreviewable } from "./mime";

/**
 * Largest image that is base64-encoded for the inline Detail preview. Files
 * above this render filename/size/type metadata instead of a huge data URI.
 */
export const MAX_INLINE_IMAGE_PREVIEW_SIZE = 5 * 1024 * 1024;

/**
 * Builds the Detail markdown preview for a loaded file. Returns an empty string
 * when the file should fall back to metadata (oversized image or binary data).
 */
export function buildFilePreview(
  data: Uint8Array,
  detected: string,
  path: string,
): string {
  if (data.length === 0) return "";

  if (detected.startsWith("image/")) {
    if (data.length > MAX_INLINE_IMAGE_PREVIEW_SIZE) return "";
    return `data:${detected};base64,${Buffer.from(data).toString("base64")}`;
  }

  // Binary data can be NUL-free (some PDFs), so the MIME type decides first.
  const textLike =
    isTextPreviewable(detected) || detected === "application/octet-stream";
  if (!textLike || data.includes(0)) return "";

  const filename = path.split("/").pop()?.toLowerCase() || "text";
  const content = Buffer.from(data).toString("utf-8");
  // Fence the content so it cannot be interpreted as markdown.
  return `\`\`\`${filename}\n${content}\n\`\`\``;
}
