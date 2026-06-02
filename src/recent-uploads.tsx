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
import { typeFromExtension } from "./lib/mime";

interface Preferences {
  recentImageCount: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

async function getHistory() {
  const prefs = getPreferenceValues<Preferences>();
  const recentCount = parseInt(prefs.recentImageCount, 10) || 50;
  return createHistoryManager(
    {
      getItem: (k) => LocalStorage.getItem<string>(k),
      setItem: (k, v) => LocalStorage.setItem(k, v),
    },
    recentCount,
  );
}

export default function RecentUploads() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const previews = useRef<Map<string, string>>(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let mounted = true;

    async function load() {
      const history = await getHistory();
      const all = await history.getAll();
      if (!mounted) return;
      setEntries(all);
      setIsLoading(false);

      // Fetch text previews for non-image files
      for (const entry of all) {
        const mime = typeFromExtension(entry.filename);
        if (!mime?.startsWith("image/")) {
          fetch(entry.url, { signal: abort.signal })
            .then((r) => r.text())
            .then((text) => {
              if (!mounted) return;
              const ext = entry.filename.split(".").pop()?.toLowerCase() || "";
              const md = ext === "md" || ext === "markdown"
                ? text
                : `\`\`\`${ext}\n${text}\n\`\`\``;
              previews.current.set(entry.url, md);
              forceUpdate((n) => n + 1);
            })
            .catch(() => {
              // Silently fail — just won't show a preview
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

  async function handleDelete(index: number) {
    if (
      !(await confirmAlert({
        title: "Delete from History",
        message: "Remove this upload from history? The file in S3 will not be deleted.",
        primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      }))
    ) {
      return;
    }
    const history = await getHistory();
    await history.remove(index);
    setEntries(await history.getAll());
    await showToast({ style: Toast.Style.Success, title: "Deleted from history" });
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search recent uploads..."
    >
      <List.Section title="Recent Uploads">
        {entries.map((entry, index) => (
          <List.Item
            key={index}
            id={String(index)}
            title={entry.filename}
            icon={{ source: entry.url, tooltip: entry.filename }}
            accessories={[
              { date: new Date(entry.timestamp), tooltip: "Uploaded" },
            ]}
            detail={
              <List.Item.Detail
                markdown={
                  typeFromExtension(entry.filename)?.startsWith("image/")
                    ? `![${entry.filename}](${entry.url})`
                    : previews.current.get(entry.url) ?? `# ${entry.filename}\n\n[Open in Browser](${entry.url})`
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
                  onAction={() => handleDelete(index)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
