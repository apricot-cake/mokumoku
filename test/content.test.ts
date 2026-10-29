import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import content from "../entrypoints/content.ts";
import {
  LOAD_CANCEL_REQUEST,
  LOAD_MORE_REQUEST,
  SNAPSHOT_REQUEST,
} from "../utils/snapshot.ts";

let context: ContentScriptContext;

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(fakeBrowser.runtime, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.runtime.onMessage, "addListener");
  document.body.innerHTML =
    "<ytd-browse><ytd-rich-grid-renderer><ytd-continuation-item-renderer></ytd-continuation-item-renderer></ytd-rich-grid-renderer></ytd-browse>";
  context = new ContentScriptContext("test");
  content.main(context);
});

afterEach(() => {
  context.notifyInvalidated();
  vi.useRealTimers();
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

function onMessage(message: unknown) {
  const handler = vi.mocked(fakeBrowser.runtime.onMessage.addListener).mock
    .calls[0]?.[0];
  if (!handler) throw new Error("読み込み操作の受信が登録されていません。");
  return handler(message, {}, vi.fn());
}

it("ページ移動で期間の読み込みを止める", async () => {
  const result = onMessage({ type: LOAD_MORE_REQUEST, untilAgeMs: 1000 });
  document.dispatchEvent(new Event("yt-navigate-start"));
  expect(await result).toBe("cancelled");
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it("中止メッセージでも、期間の読み込みを待たずに終了する", async () => {
  const result = onMessage({ type: LOAD_MORE_REQUEST, untilAgeMs: 1000 });
  onMessage({ type: LOAD_CANCEL_REQUEST });
  expect(await result).toBe("cancelled");
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it("期間を省略した読み込み依頼は受け付けない", () => {
  expect(onMessage({ type: LOAD_MORE_REQUEST })).toBeUndefined();
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it("進捗表示が隠れると、本数が少なくても読み込み中から完了へ更新する", async () => {
  window.history.replaceState({}, "", "/@example/videos");
  try {
    document.body.innerHTML =
      '<yt-page-navigation-progress aria-valuenow="100"></yt-page-navigation-progress>' +
      "<ytd-browse><ytd-rich-grid-renderer><ytd-rich-item-renderer>" +
      '<a id="video-title" href="/watch?v=a1">動画</a>' +
      '<span class="inline-metadata-item">1万回視聴</span>' +
      '<span class="inline-metadata-item">1 日前</span>' +
      "</ytd-rich-item-renderer></ytd-rich-grid-renderer></ytd-browse>";
    await vi.advanceTimersByTimeAsync(400);
    expect(await onMessage({ type: SNAPSHOT_REQUEST })).toEqual({
      kind: "loading",
    });
    document
      .querySelector("yt-page-navigation-progress")
      ?.setAttribute("hidden", "");
    await vi.advanceTimersByTimeAsync(400);
    expect(await onMessage({ type: SNAPSHOT_REQUEST })).toMatchObject({
      kind: "ready",
      videos: [{ id: "a1" }],
      canLoadMore: false,
    });
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "mokumoku:snapshot",
      snapshot: expect.objectContaining({ kind: "ready" }),
    });
  } finally {
    window.history.replaceState({}, "", "/");
  }
});
