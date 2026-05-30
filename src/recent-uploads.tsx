import {
  List,
  Action,
  ActionPanel,
  Icon,
  getPreferenceValues,
  LocalStorage,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { createHistoryManager, HistoryEntry } from "./lib/history";

interface Preferences {
  recentImageCount: string;
}

export default function RecentUploads() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const prefs = getPreferenceValues<Preferences>();
      const recentCount = parseInt(prefs.recentImageCount, 10) || 50;
      const history = createHistoryManager(
        {
          getItem: (k) => LocalStorage.getItem<string>(k),
          setItem: (k, v) => LocalStorage.setItem(k, v),
        },
        recentCount,
      );
      const all = await history.getAll();
      setEntries(all);
      setIsLoading(false);
    }
    load();
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search recent uploads...">
      {entries.map((entry, index) => (
        <List.Item
          key={index}
          title={entry.filename}
          subtitle={entry.url}
          icon={{ source: Icon.Image, tooltip: entry.filename }}
          accessories={[
            { date: new Date(entry.timestamp), tooltip: "Uploaded" },
          ]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard content={entry.url} title="Copy URL" />
              <Action.Paste content={entry.url} title="Paste URL" />
              <Action.OpenInBrowser url={entry.url} title="Open in Browser" />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
