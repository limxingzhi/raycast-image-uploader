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
import { useState, useEffect } from "react";
import { createHistoryManager, HistoryEntry } from "./lib/history";

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

  useEffect(() => {
    async function load() {
      const history = await getHistory();
      const all = await history.getAll();
      setEntries(all);
      setIsLoading(false);
    }
    load();
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
                markdown={`![${entry.filename}](${entry.url})`}
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
