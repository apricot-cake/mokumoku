import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import {
  isPageSnapshot,
  isSnapshotUpdate,
  type PageSnapshot,
  SNAPSHOT_REQUEST,
} from "../../utils/snapshot.ts";

/**
 * 現在のウィンドウで表示中のタブの読み取り結果。content script が応答しない
 * タブ（YouTube 以外、または拡張機能の導入前から開いていたタブ）は null。
 * 読み取り前は undefined。
 */
export function usePageSnapshot(): PageSnapshot | null | undefined {
  const [snapshot, setSnapshot] = useState<PageSnapshot | null | undefined>();

  useEffect(() => {
    let activeTabId: number | undefined;
    let request = 0;

    async function load(): Promise<void> {
      const current = ++request;
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      activeTabId = tab?.id;
      const response =
        activeTabId === undefined
          ? null
          : await browser.tabs
              .sendMessage(activeTabId, { type: SNAPSHOT_REQUEST })
              .catch(() => null);
      if (current === request) {
        setSnapshot(isPageSnapshot(response) ? response : null);
      }
    }

    function onMessage(
      message: unknown,
      sender: Browser.runtime.MessageSender,
    ) {
      if (sender.tab?.id === activeTabId && isSnapshotUpdate(message)) {
        request += 1;
        setSnapshot(message.snapshot);
      }
    }

    function onActivated() {
      void load();
    }

    function onUpdated(tabId: number, change: Browser.tabs.OnUpdatedInfo) {
      if (tabId === activeTabId && change.status === "complete") void load();
    }

    browser.runtime.onMessage.addListener(onMessage);
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    void load();
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return snapshot;
}
