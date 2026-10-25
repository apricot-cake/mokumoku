import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import background from "../entrypoints/background.ts";
import { type PanelOwner, panelOwnerKey } from "../utils/panel-page.ts";

vi.mock("../utils/dev-content-script-swap.ts", () => ({
  injectContentScriptInsteadOfReload: vi.fn(),
  injectContentScriptIntoOpenTabs: vi.fn(),
}));
const TAB_ID = 10;
const WINDOW_ID = 2;
const tab = {
  id: TAB_ID,
  windowId: WINDOW_ID,
  url: "https://www.youtube.com/@GoogleJapan/videos",
} as Browser.tabs.Tab;
function listener(event: "onOpened" | "onClosed") {
  const result = vi.mocked(fakeBrowser.sidePanel[event].addListener).mock
    .calls[0]?.[0];
  if (!result) throw new Error(`${event} が登録されていません。`);
  return result;
}
async function owner(tabId = TAB_ID): Promise<PanelOwner | undefined> {
  const key = panelOwnerKey(tabId);
  return (await fakeBrowser.storage.session.get(key))[key] as
    | PanelOwner
    | undefined;
}
async function openPanel(tabId = TAB_ID, windowId = WINDOW_ID) {
  listener("onOpened")({
    path: `/sidepanel.html?tabId=${tabId}`,
    windowId,
    tabId,
  });
  await vi.waitFor(async () =>
    expect(await owner(tabId)).toMatchObject({
      tabId,
      windowId,
      panelTabId: tabId,
      channelId: "UC1",
    }),
  );
}
async function expectClosed(tabId = TAB_ID) {
  await vi.waitFor(async () => {
    expect(fakeBrowser.sidePanel.close).toHaveBeenCalledWith({ tabId });
    expect(await owner(tabId)).toBeUndefined();
  });
}
beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((() =>
    Promise.resolve([tab])) as typeof fakeBrowser.tabs.query);
  vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async (id) => ({
    ...tab,
    id,
  }));
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation((() =>
    Promise.resolve("UC1")) as typeof fakeBrowser.tabs.sendMessage);
  vi.spyOn(fakeBrowser.sidePanel, "setPanelBehavior").mockResolvedValue();
  vi.spyOn(fakeBrowser.sidePanel, "setOptions").mockResolvedValue();
  vi.spyOn(fakeBrowser.sidePanel, "open").mockResolvedValue();
  vi.spyOn(fakeBrowser.sidePanel, "close").mockResolvedValue();
  vi.spyOn(fakeBrowser.runtime.onMessage, "addListener");
  vi.spyOn(fakeBrowser.sidePanel.onOpened, "addListener").mockImplementation(
    () => {},
  );
  vi.spyOn(fakeBrowser.sidePanel.onClosed, "addListener").mockImplementation(
    () => {},
  );
  background.main();
  await vi.waitFor(() =>
    expect(fakeBrowser.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: TAB_ID,
      path: `sidepanel.html?tabId=${TAB_ID}`,
      enabled: true,
    }),
  );
});
afterEach(() => {
  fakeBrowser.tabs.onCreated.removeAllListeners();
  fakeBrowser.tabs.onActivated.removeAllListeners();
  fakeBrowser.tabs.onUpdated.removeAllListeners();
  fakeBrowser.tabs.onRemoved.removeAllListeners();
  fakeBrowser.runtime.onMessage.removeAllListeners();
  vi.restoreAllMocks();
  fakeBrowser.reset();
});
describe("タブ別パネル", () => {
  it("以前の期間設定だけを削除し、他の保存値を残す", async () => {
    await fakeBrowser.storage.local.set({ period: "year", unrelated: "keep" });
    background.main();
    await vi.waitFor(async () => {
      expect(await fakeBrowser.storage.local.get(null)).toEqual({
        unrelated: "keep",
      });
    });
  });
  it("ローカル更新確認は正規のパネルURLだけ受け付ける", async () => {
    const receive = vi.mocked(fakeBrowser.runtime.onMessage.addListener).mock
      .calls[0]?.[0];
    if (!receive) throw new Error("更新確認のlistenerがありません。");
    const base = fakeBrowser.runtime.getURL("/sidepanel.html");
    const message = { type: "mokumoku:check-local-build" };
    expect(await receive(message, { url: `${base}?tabId=10` }, () => {})).toBe(
      true,
    );
    for (const url of [
      `${base}?tabId=no`,
      `${base}?tabId=10&other=1`,
      `${base}?tabId=10#x`,
      `${base}/other?tabId=10`,
      "https://example.com/sidepanel.html?tabId=10",
    ]) {
      expect(receive(message, { url }, () => {})).toBeUndefined();
    }
    expect(
      receive(message, { url: `${base}?tabId=10`, tab }, () => {}),
    ).toBeUndefined();
  });
  it("既存タブと新しいタブに個別パスを準備して標準のアイコンクリックで開く", async () => {
    expect(fakeBrowser.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    expect(fakeBrowser.sidePanel.setOptions).toHaveBeenCalledWith({
      enabled: false,
    });
    await fakeBrowser.tabs.onCreated.trigger({ ...tab, id: 11 });
    expect(fakeBrowser.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 11,
      path: "sidepanel.html?tabId=11",
      enabled: true,
    });
    await openPanel();
    expect(await owner()).toMatchObject({
      pageKey: "https://www.youtube.com/@GoogleJapan",
    });
  });
  it("開いた通知のtabIdを使い、現在タブには結び直さない", async () => {
    await openPanel(11);
    expect(fakeBrowser.tabs.get).toHaveBeenCalledWith(11);
    expect(await owner()).toBeUndefined();
  });
  it("同じチャンネル内では閉じない", async () => {
    await openPanel();
    await fakeBrowser.tabs.onUpdated.trigger(
      TAB_ID,
      { url: "https://www.youtube.com/@GoogleJapan/featured" },
      tab,
    );
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
    expect(await owner()).toBeDefined();
  });
  it("動画ページへの移動ではそのタブのパネルを閉じる", async () => {
    await openPanel();
    await fakeBrowser.tabs.onUpdated.trigger(
      TAB_ID,
      { url: "https://www.youtube.com/watch?v=example" },
      tab,
    );
    await expectClosed();
  });
  it("別チャンネルの通知ではそのタブだけ閉じる", async () => {
    await openPanel();
    await openPanel(11);
    await fakeBrowser.runtime.onMessage.trigger(
      { type: "mokumoku:channel", channelId: "UC2" },
      { tab },
      () => {},
    );
    await expectClosed();
    expect(await owner(11)).toBeDefined();
  });
  it("別タブへ切り替えて戻っても閉じたりopenを呼び直したりしない", async () => {
    await openPanel();
    await fakeBrowser.tabs.onActivated.trigger({
      tabId: 11,
      windowId: WINDOW_ID,
    });
    await fakeBrowser.tabs.onActivated.trigger({
      tabId: TAB_ID,
      windowId: WINDOW_ID,
    });
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
    expect(fakeBrowser.sidePanel.open).not.toHaveBeenCalled();
    expect(await owner()).toBeDefined();
  });
  it("複数ウィンドウ・タブの所有記録を独立して保つ", async () => {
    await openPanel();
    await openPanel(11, 3);
    expect(await owner()).toBeDefined();
    expect(await owner(11)).toMatchObject({ windowId: 3 });
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
  });
  it("閉鎖通知は一致したタブとウィンドウだけ消す", async () => {
    await openPanel();
    await openPanel(11);
    listener("onClosed")({
      path: "/sidepanel.html",
      windowId: WINDOW_ID + 1,
      tabId: TAB_ID,
    });
    listener("onClosed")({ path: "/sidepanel.html", windowId: WINDOW_ID });
    expect(await owner()).toBeDefined();
    listener("onClosed")({
      path: "/sidepanel.html",
      windowId: WINDOW_ID,
      tabId: TAB_ID,
    });
    await vi.waitFor(async () => expect(await owner()).toBeUndefined());
    expect(await owner(11)).toBeDefined();
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
  });
  it("タブを閉じたらその記録だけ消す", async () => {
    await openPanel();
    await openPanel(11);
    await fakeBrowser.tabs.onRemoved.trigger(TAB_ID, {
      windowId: WINDOW_ID,
      isWindowClosing: false,
    });
    expect(await owner()).toBeUndefined();
    expect(await owner(11)).toBeDefined();
  });
  it("SW再起動後もstorageの記録からページ移動を判定する", async () => {
    await fakeBrowser.storage.session.set({
      [panelOwnerKey(TAB_ID)]: {
        tabId: TAB_ID,
        windowId: WINDOW_ID,
        panelTabId: TAB_ID,
        pageKey: "https://www.youtube.com/@GoogleJapan",
        channelId: "UC1",
      },
    });
    await fakeBrowser.tabs.onUpdated.trigger(
      TAB_ID,
      { url: "https://example.com/" },
      tab,
    );
    await expectClosed();
  });
  it("チャンネル問い合わせ中に閉じた記録を書き戻さない", async () => {
    let respond: ((id: string) => void) | undefined;
    const response = new Promise<string>((resolve) => {
      respond = resolve;
    });
    vi.mocked(fakeBrowser.tabs.sendMessage).mockImplementation(
      (() => response) as typeof fakeBrowser.tabs.sendMessage,
    );
    listener("onOpened")({
      path: "/sidepanel.html",
      windowId: WINDOW_ID,
      tabId: TAB_ID,
    });
    await vi.waitFor(async () =>
      expect(await owner()).toMatchObject({ channelId: null }),
    );
    listener("onClosed")({
      path: "/sidepanel.html",
      windowId: WINDOW_ID,
      tabId: TAB_ID,
    });
    await vi.waitFor(async () => expect(await owner()).toBeUndefined());
    respond?.("UC1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await owner()).toBeUndefined();
  });
});
