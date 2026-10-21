import { browser } from "wxt/browser";
import {
  hasLeftPanelPage,
  isPanelOwner,
  type PanelOwner,
  panelPageKey,
} from "../utils/panel-page.ts";

// パネルを開いているタブ。service worker は休止するので session storage に置く。
const OWNER_KEY = "panelOwner";
const PANEL_PATH = "sidepanel.html";

async function readOwner(): Promise<PanelOwner | null> {
  const stored = await browser.storage.session.get(OWNER_KEY);
  const owner = stored[OWNER_KEY];
  return isPanelOwner(owner) ? owner : null;
}

/** タブ専用のパネルを無効にすると、開いていたパネルも閉じる。 */
async function closePanel(owner: PanelOwner): Promise<void> {
  await browser.storage.session.remove(OWNER_KEY);
  await browser.sidePanel
    .setOptions({ tabId: owner.tabId, enabled: false })
    .catch(() => {});
}

export default defineBackground(() => {
  // パネルはツールバーのアイコンを押したタブにだけ開く。全タブ共通の
  // パネル（manifest の default_path）は無効にしておく。
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  void browser.sidePanel.setOptions({ enabled: false });

  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const tabId = tab.id;
    // open はユーザー操作の直後に呼ぶ必要があるので、最初の await より前に呼ぶ。
    const options = browser.sidePanel.setOptions({
      tabId,
      path: PANEL_PATH,
      enabled: true,
    });
    const opened = browser.sidePanel.open({ tabId });
    void (async () => {
      const previous = await readOwner();
      if (previous && previous.tabId !== tabId) await closePanel(previous);
      const owner: PanelOwner = {
        tabId,
        windowId: tab.windowId,
        pageKey: panelPageKey(tab.url),
      };
      await browser.storage.session.set({ [OWNER_KEY]: owner });
      await Promise.all([options, opened]);
    })().catch((error: unknown) => {
      console.error("mokumoku のパネルを開けませんでした。", error);
    });
  });

  // 同じウィンドウで別のタブに切り替えたら閉じる。
  browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void readOwner().then((owner) => {
      if (owner && owner.windowId === windowId && owner.tabId !== tabId)
        return closePanel(owner);
    });
  });

  // パネルを開いたページから別のページへ移ったら閉じる。
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url === undefined && change.status !== "loading") return;
    void readOwner().then((owner) => {
      if (
        owner?.tabId === tabId &&
        hasLeftPanelPage(owner, {
          url: change.url ?? tab.url,
          loading: change.status === "loading",
        })
      )
        return closePanel(owner);
    });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void readOwner().then((owner) => {
      if (owner?.tabId === tabId)
        return browser.storage.session.remove(OWNER_KEY);
    });
  });

  // パネルを閉じるボタンで閉じたときも、所有タブの記録を消す。
  browser.sidePanel.onClosed?.addListener(({ tabId }) => {
    void readOwner().then((owner) => {
      if (owner && owner.tabId === tabId) return closePanel(owner);
    });
  });
});
