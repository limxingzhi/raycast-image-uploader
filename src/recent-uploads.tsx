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
import { fetchTextPreview } from "./lib/text-preview";
import { resolveRecentCount } from "./lib/recent-count";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export default function RecentUploads() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previews, setPreviews] = useState<Record<string, string>>({}); // Preview markdown keyed by URL.
  const prefs = getPreferenceValues<Preferences.RecentUploads>();
  const recentCount = resolveRecentCount(prefs.recentImageCount);
  const historyRef = useRef(createHistoryManager(
    {
      getItem: (k) => LocalStorage.getItem<string>(k),
      setItem: (k, v) => LocalStorage.setItem(k, v),
    },
    recentCount,
  )); // One manager per command; the real LocalStorage adapter is injected here.

  useEffect(() => {
    const abort = new AbortController();
    let mounted = true;

    // Load history once, then fetch previews in the background.
    async function load() {
      const all = await historyRef.current.getAll();
      if (!mounted) return;
      // Render the list immediately; previews can arrive later.
      setEntries(all);
      setIsLoading(false);

      // Fetch text previews for text-based files under the size limit
      for (const entry of all) {
        const mime = typeFromExtension(entry.filename);
        if (mime && isTextPreviewable(mime)) {
          // Each fetch is independent; failures simply leave the metadata view.
          fetchTextPreview(entry, abort.signal)
            .then((text) => {
              if (!text || !mounted) return;
              const ext = entry.filename.split(".").pop()?.toLowerCase() || "";
              // Fence the text so file content cannot render as markdown.
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
      // Cancel any preview downloads still in flight.
      abort.abort();
    };
  }, []);

  async function handleDelete(url: string, timestamp: number) {
    // Resolve the entry by identity; a list index can shift if history changes.
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
    // Re-read after the write so the UI matches what is stored.
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
              // The object itself doubles as the icon for images on public buckets.
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
                    : // Text uses the fetched preview; everything else links out.
                      previews[entry.url] ?? `# ${entry.filename}\n\n[Open in Browser](${entry.url})`
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
