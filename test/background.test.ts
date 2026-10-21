import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import background from "../entrypoints/background.ts";
import type { PanelOwner } from "../utils/panel-page.ts";

vi.mock("../utils/dev-content-script-swap.ts", () => ({
  injectContentScriptInsteadOfReload: vi.fn(),
  injectContentScriptIntoOpenTabs: vi.fn(),
}));

const TAB_ID = 10;
const WINDOW_ID = 2;
const CHANNEL_URL = "https://www.youtube.com/@GoogleJapan/videos";
const tab = {
  id: TAB_ID,
  windowId: WINDOW_ID,
  url: CHANNEL_URL,
} as Browser.tabs.Tab;

function openedListener() {
  const listener = vi.mocked(fakeBrowser.sidePanel.onOpened.addListener).mock
    .calls[0]?.[0];
  if (!listener) throw new Error("onOpened が登録されていません。");
  return listener;
}

function closedListener() {
  const listener = vi.mocked(fakeBrowser.sidePanel.onClosed.addListener).mock
    .calls[0]?.[0];
  if (!listener) throw new Error("onClosed が登録されていません。");
  return listener;
}

async function owner(): Promise<PanelOwner | undefined> {
  return (await fakeBrowser.storage.session.get("panelOwner")).panelOwner as
    | PanelOwner
    | undefined;
}

async function openPanel(panelTabId?: number): Promise<void> {
  openedListener()({
    path: "/sidepanel.html",
    windowId: WINDOW_ID,
    ...(panelTabId === undefined ? {} : { tabId: panelTabId }),
  });
  await vi.waitFor(async () => {
    expect(await owner()).toMatchObject({
      tabId: TAB_ID,
      windowId: WINDOW_ID,
      panelTabId: panelTabId ?? null,
      channelId: "UC1",
    });
  });
}

async function expectClosed(options: { windowId: number } | { tabId: number }) {
  await vi.waitFor(async () => {
    expect(fakeBrowser.sidePanel.close).toHaveBeenCalledWith(options);
    expect(await owner()).toBeUndefined();
  });
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((() =>
    Promise.resolve([tab])) as typeof fakeBrowser.tabs.query);
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation((() =>
    Promise.resolve("UC1")) as typeof fakeBrowser.tabs.sendMessage);
  vi.spyOn(fakeBrowser.sidePanel, "setPanelBehavior").mockResolvedValue();
  vi.spyOn(fakeBrowser.sidePanel, "close").mockResolvedValue();
  vi.spyOn(fakeBrowser.sidePanel.onOpened, "addListener").mockImplementation(
    () => {},
  );
  vi.spyOn(fakeBrowser.sidePanel.onClosed, "addListener").mockImplementation(
    () => {},
  );
  background.main();
});

afterEach(() => {
  fakeBrowser.tabs.onActivated.removeAllListeners();
  fakeBrowser.tabs.onUpdated.removeAllListeners();
  fakeBrowser.tabs.onRemoved.removeAllListeners();
  fakeBrowser.runtime.onMessage.removeAllListeners();
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

describe("パネルの所有タブ", () => {
  it("アイコンのクリック通知なしでも、開いたウィンドウのタブを記録する", async () => {
    await openPanel();
    expect(fakeBrowser.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    expect(fakeBrowser.tabs.query).toHaveBeenCalledWith({
      active: true,
      windowId: WINDOW_ID,
    });
    expect(await owner()).toMatchObject({
      pageKey: "https://www.youtube.com/@GoogleJapan",
    });
  });

  it("同じチャンネル内の移動ではパネルを閉じない", async () => {
    await openPanel();
    await fakeBrowser.tabs.onUpdated.trigger(
      TAB_ID,
      { url: "https://www.youtube.com/@GoogleJapan/featured" },
      tab,
    );
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
    expect(await owner()).toBeDefined();
  });

  it("動画ページへの移動ではウィンドウのパネルを閉じる", async () => {
    await openPanel();
    await fakeBrowser.tabs.onUpdated.trigger(
      TAB_ID,
      { url: "https://www.youtube.com/watch?v=example" },
      tab,
    );
    await expectClosed({ windowId: WINDOW_ID });
  });

  it("別のチャンネルの通知でウィンドウのパネルを閉じる", async () => {
    await openPanel();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: "mokumoku:channel", channelId: "UC2" },
      { tab },
      () => {},
    );
    await expectClosed({ windowId: WINDOW_ID });
  });

  it("同じウィンドウの別タブへ切り替えると閉じる", async () => {
    await openPanel();
    await fakeBrowser.tabs.onActivated.trigger({
      tabId: TAB_ID + 1,
      windowId: WINDOW_ID,
    });
    await expectClosed({ windowId: WINDOW_ID });
  });

  it("別ウィンドウのタブ切り替えでは閉じない", async () => {
    await openPanel();
    await fakeBrowser.tabs.onActivated.trigger({
      tabId: TAB_ID + 1,
      windowId: WINDOW_ID + 1,
    });
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
    expect(await owner()).toBeDefined();
  });

  it("別ウィンドウと異なるスコープの閉鎖通知では所有者を消さない", async () => {
    await openPanel();
    closedListener()({ path: "/sidepanel.html", windowId: WINDOW_ID + 1 });
    closedListener()({
      path: "/sidepanel.html",
      windowId: WINDOW_ID,
      tabId: TAB_ID,
    });
    expect(await owner()).toBeDefined();
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
  });

  it("所有パネルの閉鎖通知で記録を消し、もう一度閉じない", async () => {
    await openPanel();
    closedListener()({ path: "/sidepanel.html", windowId: WINDOW_ID });
    await vi.waitFor(async () => expect(await owner()).toBeUndefined());
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
  });

  it("旧設定のタブ専用パネルはタブを指定して閉じる", async () => {
    await openPanel(TAB_ID);
    closedListener()({ path: "/sidepanel.html", windowId: WINDOW_ID });
    expect(await owner()).toBeDefined();
    await fakeBrowser.tabs.onActivated.trigger({
      tabId: TAB_ID + 1,
      windowId: WINDOW_ID,
    });
    await expectClosed({ tabId: TAB_ID });
  });

  it("タブ専用パネルの一致する閉鎖通知で所有者を消す", async () => {
    await openPanel(TAB_ID);
    closedListener()({
      path: "/sidepanel.html",
      windowId: WINDOW_ID,
      tabId: TAB_ID,
    });
    await vi.waitFor(async () => expect(await owner()).toBeUndefined());
    expect(fakeBrowser.sidePanel.close).not.toHaveBeenCalled();
  });

  it("チャンネルの問い合わせ中に閉じたパネルの所有者を書き戻さない", async () => {
    let respond: ((channelId: string) => void) | undefined;
    const response = new Promise<string>((resolve) => {
      respond = resolve;
    });
    vi.mocked(fakeBrowser.tabs.sendMessage).mockImplementation(
      (() => response) as typeof fakeBrowser.tabs.sendMessage,
    );
    openedListener()({ path: "/sidepanel.html", windowId: WINDOW_ID });
    await vi.waitFor(async () => {
      expect(await owner()).toMatchObject({ tabId: TAB_ID, channelId: null });
      expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalled();
    });
    closedListener()({ path: "/sidepanel.html", windowId: WINDOW_ID });
    await vi.waitFor(async () => expect(await owner()).toBeUndefined());
    if (!respond) throw new Error("チャンネル問い合わせがありません。");
    respond("UC1");
    // 応答後の所有者確認と保存が終わるまで1イベントループ待つ。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await owner()).toBeUndefined();
  });
});
