import { browser } from "wxt/browser";
import { loadUntil } from "../utils/load-more.ts";
import {
  CHANNEL_REQUEST,
  CHANNEL_UPDATE,
  type ChannelUpdate,
} from "../utils/panel-page.ts";
import {
  isLoadMoreRequest,
  LOAD_CANCEL_REQUEST,
  type LoadMoreResult,
  type PageSnapshot,
  SNAPSHOT_REQUEST,
  SNAPSHOT_UPDATE,
  type SnapshotUpdate,
} from "../utils/snapshot.ts";
import { readChannelId, readSnapshot } from "../utils/youtube-page.ts";

// YouTube は再生中も DOM を頻繁に書き換えるので、変化をまとめてから読む。
const READ_DELAY_MS = 400;

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_idle",
  main(ctx) {
    let snapshot: PageSnapshot = readSnapshot(document, location.pathname);
    let serialized = JSON.stringify(snapshot);
    let timer: number | undefined;
    // 読み込み中に重ねて頼まれたら、同じ読み込みの結果を返す。
    let loading: Promise<LoadMoreResult> | null = null;
    let cancelLoading: AbortController | null = null;
    let channelId = readChannelId(document, location.pathname);

    // 表示中のチャンネルが変わったら background に知らせる。background は
    // パネルを開いたチャンネルと比べ、別のチャンネルならパネルを閉じる。
    function reportChannel(): void {
      const update: ChannelUpdate = { type: CHANNEL_UPDATE, channelId };
      browser.runtime.sendMessage(update).catch(() => {});
    }

    function refresh(): void {
      timer = undefined;
      const nextChannelId = readChannelId(document, location.pathname);
      if (nextChannelId !== channelId) {
        channelId = nextChannelId;
        reportChannel();
      }
      const next = readSnapshot(document, location.pathname);
      const nextSerialized = JSON.stringify(next);
      if (nextSerialized === serialized) return;
      snapshot = next;
      serialized = nextSerialized;
      const update: SnapshotUpdate = { type: SNAPSHOT_UPDATE, snapshot };
      // パネルが閉じていると受け手がいないので、送信失敗は無視する。
      browser.runtime.sendMessage(update).catch(() => {});
    }

    function scheduleRefresh(): void {
      if (timer === undefined) {
        timer = ctx.setTimeout(refresh, READ_DELAY_MS);
      }
    }

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "selected", "hidden"],
    });
    ctx.onInvalidated(() => observer.disconnect());
    // 移動元の追加読み込みを、移動先の一覧へ続けない。
    ctx.addEventListener(document, "yt-navigate-start", () => {
      cancelLoading?.abort();
    });
    // SPA の遷移完了。DOM の差し替えより先に URL が変わるので、遷移後にも読み直す。
    ctx.addEventListener(document, "yt-navigate-finish", scheduleRefresh);

    function onMessage(message: unknown) {
      if (isLoadMoreRequest(message)) {
        if (loading === null) {
          const controller = new AbortController();
          cancelLoading = controller;
          loading = loadUntil(
            document,
            message.untilAgeMs,
            controller.signal,
          ).finally(() => {
            loading = null;
            cancelLoading = null;
            // 完了の応答より先に最新の一覧を送り、パネルが古い件数で
            // 完了を表示しないようにする。
            if (timer !== undefined) clearTimeout(timer);
            refresh();
          });
        }
        return loading;
      }
      const type = (message as { type?: unknown })?.type;
      if (type === LOAD_CANCEL_REQUEST) {
        cancelLoading?.abort();
        return;
      }
      if (type === CHANNEL_REQUEST) return Promise.resolve(channelId);
      if (type !== SNAPSHOT_REQUEST) return;
      if (timer !== undefined) {
        clearTimeout(timer);
        refresh();
      }
      return Promise.resolve(snapshot);
    }

    browser.runtime.onMessage.addListener(onMessage);
    // ページ全体を読み込み直したときは、前のページの content script が
    // 知らせる機会がないので、起動時にも知らせる。
    reportChannel();
    // 新しい content script に差し替わったとき（開発サーバーでの注入）や
    // 拡張機能が更新されたときは、受信と読み込みをやめて新しいほうに任せる。
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      cancelLoading?.abort();
    });
  },
});
