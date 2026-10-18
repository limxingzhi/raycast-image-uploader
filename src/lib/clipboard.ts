import { fileURLToPath } from "url";

// Clipboard reports `file` as either a file:// URL or a bare path. Only the
// former needs conversion; passing a bare path to fileURLToPath would throw.
export function clipboardFileToPath(file: string): string {
  return file.startsWith("file://") ? fileURLToPath(file) : file;
}
