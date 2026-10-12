import { fileURLToPath } from "url";

export function clipboardFileToPath(file: string): string {
  return file.startsWith("file://") ? fileURLToPath(file) : file;
}
