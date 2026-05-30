import {
  Clipboard,
  showToast,
  Toast,
  getPreferenceValues,
  confirmAlert,
  Alert,
  popToRoot,
} from "@raycast/api";
import { readFile } from "fs/promises";
import { extname } from "path";
import fileUriToPath from "file-uri-to-path";
import { generateKey, uploadToS3 } from "./lib/s3";
import { createHistoryManager } from "./lib/history";
import { LocalStorage } from "@raycast/api";

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

export default async function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const recentCount = parseInt(prefs.recentImageCount, 10) || 50;

  const { file } = await Clipboard.read();
  if (!file) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No image found in clipboard",
    });
    return;
  }

  const filePath = fileUriToPath(file);
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? "image/png";

  if (!prefs.uploadWithoutAsking) {
    await popToRoot({ clearSearchBar: true });
    await confirmAlert({
      title: "Upload this image?",
      message: `File: ${filePath.split("/").pop()}`,
      primaryAction: { title: "Upload", style: Alert.ActionStyle.Default },
    });
  }

  const key = generateKey(mimeType);
  const fileData = await readFile(filePath);

  const url = await uploadToS3(
    {
      endpoint: prefs.s3Endpoint,
      bucket: prefs.s3Bucket,
      accessKeyId: prefs.s3AccessKey,
      secretAccessKey: prefs.s3SecretKey,
    },
    key,
    fileData,
    mimeType,
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
}
