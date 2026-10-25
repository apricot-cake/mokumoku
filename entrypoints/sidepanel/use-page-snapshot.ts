import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import {
  isPageSnapshot,
  isSnapshotUpdate,
  LOAD_CANCEL_REQUEST,
  type PageSnapshot,
  SNAPSHOT_REQUEST,
} from "../../utils/snapshot.ts";

export interface PageState {
  readonly tabId: number;
  /** 同じタブ内のページ移動を区別する。単なる一覧更新では変えない。 */
  readonly pageVersion: number;
  readonly snapshot: PageSnapshot;
}

/**
 * パネルに結び付いたタブと、その読み取り結果。単独プレビューでは現在のタブ。
 * content script が応答
 * しないタブ（YouTube 以外、または拡張機能の導入前から開いていたタブ）は null。
 * 読み取り前は undefined。
 */
export function usePageSnapshot(): PageState | null | undefined {
  const [state, setState] = useState<PageState | null | undefined>();

  useEffect(() => {
    const parameter = new URL(window.location.href).searchParams.get("tabId");
    const panelTabId =
      parameter !== null && /^\d+$/.test(parameter)
        ? Number(parameter)
        : undefined;
    let activeTabId: number | undefined;
    let request = 0;
    let pageVersion = 0;
    let pageUrl: string | undefined;

    async function load(): Promise<void> {
      const current = ++request;
      const tabId =
        panelTabId ??
        (await browser.tabs.query({ active: true, currentWindow: true }))[0]
          ?.id;
      activeTabId = tabId;
      const [response, tab] = await Promise.all([
        tabId === undefined
          ? null
          : browser.tabs
              .sendMessage(tabId, { type: SNAPSHOT_REQUEST })
              .catch(() => null),
        tabId !== undefined && pageUrl === undefined
          ? browser.tabs.get(tabId).catch(() => null)
          : null,
      ]);
      pageUrl ??= tab?.url;
      if (current === request) {
        setState(
          tabId !== undefined && isPageSnapshot(response)
            ? {
                tabId,
                pageVersion,
                snapshot: response,
              }
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
        setState({
          tabId,
          pageVersion,
          snapshot: message.snapshot,
        });
      }
    }

    function onActivated() {
      if (panelTabId === undefined) void load();
    }

    function onUpdated(tabId: number, change: Browser.tabs.OnUpdatedInfo) {
      if (tabId !== activeTabId) return;
      const navigated = change.url !== undefined && change.url !== pageUrl;
      const reloaded = change.status === "loading";
      if (navigated || reloaded) {
        if (change.url !== undefined) pageUrl = change.url;
        pageVersion += 1;
        request += 1;
        setState((current) =>
          current?.tabId === tabId
            ? {
                ...current,
                pageVersion,
              }
            : current,
        );
        void browser.tabs
          .sendMessage(tabId, { type: LOAD_CANCEL_REQUEST })
          .catch(() => {});
      }
      if (navigated || reloaded || change.status === "complete") void load();
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
