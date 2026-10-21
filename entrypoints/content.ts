import { browser } from "wxt/browser";
import { loadMore } from "../utils/load-more.ts";
import {
  LOAD_MORE_REQUEST,
  type LoadMoreResult,
  type PageSnapshot,
  SNAPSHOT_REQUEST,
  SNAPSHOT_UPDATE,
  type SnapshotUpdate,
} from "../utils/snapshot.ts";
import { readSnapshot } from "../utils/youtube-page.ts";

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

    function refresh(): void {
      timer = undefined;
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
    // SPA の遷移完了。DOM の差し替えより先に URL が変わるので、遷移後にも読み直す。
    ctx.addEventListener(document, "yt-navigate-finish", scheduleRefresh);

    browser.runtime.onMessage.addListener((message) => {
      const type = (message as { type?: unknown })?.type;
      if (type === LOAD_MORE_REQUEST) {
        loading ??= loadMore(document).finally(() => {
          loading = null;
        });
        return loading;
      }
      if (type !== SNAPSHOT_REQUEST) return;
      if (timer !== undefined) {
        clearTimeout(timer);
        refresh();
      }
      return Promise.resolve(snapshot);
    });
  },
});
