import { EventEmitter } from "node:events";
import type { Page } from "puppeteer-core";
import { afterEach, expect, test, vi } from "vitest";
import { liveNetwork } from "./live-network.ts";

afterEach(() => vi.useRealTimers());
function setup() {
  const page = Object.assign(new EventEmitter(), {
    setRequestInterception: vi.fn(),
    isClosed: () => false,
    mainFrame: () => null,
  });
  return { page, network: liveNetwork() };
}
function request(
  url: string,
  options: { type?: string; document?: boolean; body?: string } = {},
) {
  return {
    url: () => url,
    resourceType: () => options.type ?? "fetch",
    isNavigationRequest: () => options.document ?? false,
    frame: () => null,
    postData: () => options.body,
    abort: vi.fn(),
    continue: vi.fn(),
  };
}
test.each([403, 429, 503])(
  "HTTP %iの後は追加通信を止め、Retry-Afterを記録する",
  async (status) => {
    const { page, network } = setup();
    await network.attach(page as unknown as Page);
    page.emit("response", {
      url: () => "https://www.youtube.com/youtubei/v1/browse",
      status: () => status,
      headers: () => ({ "retry-after": "120" }),
    });
    const next = request("https://www.youtube.com/@channel/videos", {
      document: true,
    });
    page.emit("request", next);
    expect(next.abort).toHaveBeenCalledOnce();
    expect(next.continue).not.toHaveBeenCalled();
    expect(network.state.responses[0]?.retryAfter).toBe("120");
  },
);
test("追加動画のcontinuation要求を送らずに停止する", async () => {
  const { page, network } = setup();
  await network.attach(page as unknown as Page);
  const next = request("https://www.youtube.com/youtubei/v1/browse", {
    body: JSON.stringify({ continuation: "token" }),
  });
  page.emit("request", next);
  expect(next.abort).toHaveBeenCalledOnce();
  expect(next.continue).not.toHaveBeenCalled();
  expect(network.state.failure).toContain("追加の動画取得");
});
test.each(["image", "font", "media"])("%sを取得しない", async (type) => {
  const { page, network } = setup();
  await network.attach(page as unknown as Page);
  const next = request("https://i.ytimg.com/thumbnail.jpg", { type });
  page.emit("request", next);
  expect(next.abort).toHaveBeenCalledOnce();
  expect(network.state.failure).toBe("");
});
test("ページ取得の上限を超える前に停止する", async () => {
  vi.useFakeTimers();
  const { page, network } = setup();
  await network.attach(page as unknown as Page);
  for (let index = 0; index < 3; index += 1) {
    const next = request("https://www.youtube.com/@channel/videos", {
      document: true,
    });
    page.emit("request", next);
    await vi.runAllTimersAsync();
    expect(next.continue).toHaveBeenCalledOnce();
  }
  const extra = request("https://www.youtube.com/@channel/videos", {
    document: true,
  });
  page.emit("request", extra);
  expect(extra.abort).toHaveBeenCalledOnce();
  expect(extra.continue).not.toHaveBeenCalled();
});
test("連続した一覧API要求の間を2秒以上空ける", async () => {
  vi.useFakeTimers();
  const { page, network } = setup();
  await network.attach(page as unknown as Page);
  const first = request("https://www.youtube.com/youtubei/v1/browse");
  page.emit("request", first);
  await vi.runAllTimersAsync();
  const next = request("https://www.youtube.com/youtubei/v1/browse");
  page.emit("request", next);
  await vi.advanceTimersByTimeAsync(1999);
  expect(next.continue).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(next.continue).toHaveBeenCalledOnce();
});
