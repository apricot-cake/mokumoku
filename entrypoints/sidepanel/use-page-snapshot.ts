import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import {
  isPageSnapshot,
  isSnapshotUpdate,
  type PageSnapshot,
  SNAPSHOT_REQUEST,
} from "../../utils/snapshot.ts";

export interface PageState {
  readonly tabId: number;
  readonly snapshot: PageSnapshot;
}

/**
 * 現在のウィンドウで表示中のタブと、その読み取り結果。content script が応答
 * しないタブ（YouTube 以外、または拡張機能の導入前から開いていたタブ）は null。
 * 読み取り前は undefined。
 */
export function usePageSnapshot(): PageState | null | undefined {
  const [state, setState] = useState<PageState | null | undefined>();

  useEffect(() => {
    let activeTabId: number | undefined;
    let request = 0;

    async function load(): Promise<void> {
      const current = ++request;
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tab?.id;
      activeTabId = tabId;
      const response =
        tabId === undefined
          ? null
          : await browser.tabs
              .sendMessage(tabId, { type: SNAPSHOT_REQUEST })
              .catch(() => null);
      if (current === request) {
        setState(
          tabId !== undefined && isPageSnapshot(response)
            ? { tabId, snapshot: response }
            : null,
        );
      }
    }

    function onMessage(
      message: unknown,
      sender: Browser.runtime.MessageSender,
    ) {
      const tabId = sender.tab?.id;
      if (
        tabId !== undefined &&
        tabId === activeTabId &&
        isSnapshotUpdate(message)
      ) {
        request += 1;
        setState({ tabId, snapshot: message.snapshot });
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

  return state;
}
