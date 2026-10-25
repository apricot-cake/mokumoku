import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import content from "../entrypoints/content.ts";
import { LOAD_CANCEL_REQUEST, LOAD_MORE_REQUEST } from "../utils/snapshot.ts";

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

it.each([undefined, 1000])(
  "ページ移動で読み込みを止める（期間: %s）",
  async (untilAgeMs) => {
    const result = onMessage({ type: LOAD_MORE_REQUEST, untilAgeMs });
    document.dispatchEvent(new Event("yt-navigate-start"));
    expect(await result).toBe("cancelled");
    expect(window.scrollTo).not.toHaveBeenCalled();
  },
);

it("中止メッセージでも、単発の読み込みを待たずに終了する", async () => {
  const result = onMessage({ type: LOAD_MORE_REQUEST });
  onMessage({ type: LOAD_CANCEL_REQUEST });
  expect(await result).toBe("cancelled");
  expect(window.scrollTo).not.toHaveBeenCalled();
});
