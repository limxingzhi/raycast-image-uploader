import {
  List,
  Action,
  ActionPanel,
  getPreferenceValues,
  LocalStorage,
  showToast,
  Toast,
  Icon,
  confirmAlert,
  Alert,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import { createHistoryManager, HistoryEntry } from "./lib/history";
import { typeFromExtension, isTextPreviewable } from "./lib/mime";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5 MB — skip text previews for larger files

/** Fetch a text preview, capping the response body at MAX_PREVIEW_SIZE bytes. */
async function fetchTextPreview(
  entry: HistoryEntry,
  signal: AbortSignal,
): Promise<string | null> {
  const r = await fetch(entry.url, { signal });
  if (!r.ok || !r.body) return null;
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_PREVIEW_SIZE) return null; // too large, abort
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return result;
}

export default function RecentUploads() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const prefs = getPreferenceValues<Preferences.RecentUploads>();
  const recentCount = parseInt(prefs.recentImageCount, 10) || 50;
  const historyRef = useRef(createHistoryManager(
    {
      getItem: (k) => LocalStorage.getItem<string>(k),
      setItem: (k, v) => LocalStorage.setItem(k, v),
    },
    recentCount,
  ));

  useEffect(() => {
    const abort = new AbortController();
    let mounted = true;

    async function load() {
      const all = await historyRef.current.getAll();
      if (!mounted) return;
      setEntries(all);
      setIsLoading(false);

      // Fetch text previews for text-based files under the size limit
      for (const entry of all) {
        const mime = typeFromExtension(entry.filename);
        if (mime && isTextPreviewable(mime)) {
          fetchTextPreview(entry, abort.signal)
            .then((text) => {
              if (!text || !mounted) return;
              const ext = entry.filename.split(".").pop()?.toLowerCase() || "";
              const md = `\`\`\`${ext}\n${text}\n\`\`\``;
              setPreviews((prev) => ({ ...prev, [entry.url]: md }));
            })
            .catch(() => {
              // Preview failed — won't show text preview for this entry
            });
        }
      }
    }
    load();

    return () => {
      mounted = false;
      abort.abort();
    };
  }, []);

  async function handleDelete(url: string, timestamp: number) {
    const all = await historyRef.current.getAll();
    const index = all.findIndex((e) => e.url === url && e.timestamp === timestamp);
    if (index === -1) return;
    if (
      !(await confirmAlert({
        title: "Delete from History",
        message: "Remove this upload from history? The file in S3 will not be deleted.",
        primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      }))
    ) {
      return;
    }
    await historyRef.current.remove(index);
    setEntries(await historyRef.current.getAll());
    await showToast({ style: Toast.Style.Success, title: "Deleted from history" });
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search recent uploads..."
    >
      <List.Section title="Recent Uploads">
        {entries.map((entry) => (
          <List.Item
            key={`${entry.url}-${entry.timestamp}`}
            id={`${entry.url}-${entry.timestamp}`}
            title={entry.filename}
            icon={{
              source: typeFromExtension(entry.filename)?.startsWith("image/") ? entry.url : Icon.Document,
              tooltip: entry.filename,
            }}
            accessories={[
              { date: new Date(entry.timestamp), tooltip: "Uploaded" },
            ]}
            detail={
              <List.Item.Detail
                markdown={
                  typeFromExtension(entry.filename)?.startsWith("image/")
                    ? `![${entry.filename}](${entry.url})`
                    : previews[entry.url] ?? `# ${entry.filename}\n\n[Open in Browser](${entry.url})`
                }
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Filename"
                      text={entry.filename}
                    />
                    <List.Item.Detail.Metadata.Label
                      title="Uploaded"
                      text={formatDate(entry.timestamp)}
                    />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Link
                      title="URL"
                      target={entry.url}
                      text={entry.url}
                    />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  content={entry.url}
                  title="Copy URL"
                  shortcut={{ key: "y", modifiers: ["cmd"] }}
                />
                <Action.OpenInBrowser
                  url={entry.url}
                  title="Open in Browser"
                  shortcut={{ key: "o", modifiers: ["cmd"] }}
                />
                <Action
                  title="Delete from History"
                  shortcut={{ key: "d", modifiers: ["cmd"] }}
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => handleDelete(entry.url, entry.timestamp)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
