import { browser } from "wxt/browser";
import {
  injectContentScriptInsteadOfReload,
  injectContentScriptIntoOpenTabs,
} from "../utils/dev-content-script-swap.ts";
import {
  CHECK_LOCAL_BUILD,
  checkLocalBuild,
} from "../utils/local-build-reload.ts";
import {
  CHANNEL_REQUEST,
  hasLeftPanelChannel,
  hasLeftPanelPage,
  isChannelUpdate,
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
/** タブの content script が読んだチャンネル ID。応答がなければ null。 */
async function readTabChannelId(tabId: number): Promise<string | null> {
  const channelId: unknown = await browser.tabs
    .sendMessage(tabId, { type: CHANNEL_REQUEST })
    .catch(() => null);
  return typeof channelId === "string" ? channelId : null;
}

async function closePanel(owner: PanelOwner): Promise<void> {
  await browser.storage.session.remove(OWNER_KEY);
  await browser.sidePanel
    .setOptions({ tabId: owner.tabId, enabled: false })
    .catch(() => {});
}

export default defineBackground(() => {
  // 開発サーバーでは、コードを変えても開いている YouTube のタブを再読み込み
  // せずに新しい content script へ差し替える。
  if (import.meta.env.COMMAND === "serve") injectContentScriptInsteadOfReload();
  // 開発サーバーとローカル配備ビルドは、拡張機能が読み込み直されるたびに
  // 開いている YouTube のタブの content script が切れるので、起動時に入れ直す。
  // ストアに出す配布用のビルドには含めない。
  if (import.meta.env.COMMAND === "serve" || __MOKUMOKU_LOCAL_DEPLOY__)
    void injectContentScriptIntoOpenTabs();

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
    // ローカル配備ビルドは、パネルを開くたびに配備済みのビルドを問い合わせる。
    // 新しいビルドがあれば自分を読み込み直し、パネルは閉じる。開き直すと
    // 新しいビルドを使える。
    if (__MOKUMOKU_LOCAL_DEPLOY__) void checkLocalBuild(__MOKUMOKU_BUILD_ID__);
    void (async () => {
      const previous = await readOwner();
      if (previous && previous.tabId !== tabId) await closePanel(previous);
      const owner: PanelOwner = {
        tabId,
        windowId: tab.windowId,
        pageKey: panelPageKey(tab.url),
        channelId: await readTabChannelId(tabId),
      };
      await browser.storage.session.set({ [OWNER_KEY]: owner });
      await Promise.all([options, opened]);
    })().catch((error: unknown) => {
      console.error("mokumoku のパネルを開けませんでした。", error);
    });
  });

  // パネルの操作の直前の確認。パネルからの問い合わせだけを受け付ける。
  browser.runtime.onMessage.addListener((message, sender) => {
    if (
      (message as { type?: unknown })?.type !== CHECK_LOCAL_BUILD ||
      sender.tab !== undefined ||
      sender.url !== browser.runtime.getURL(`/${PANEL_PATH}`)
    )
      return;
    return __MOKUMOKU_LOCAL_DEPLOY__
      ? checkLocalBuild(__MOKUMOKU_BUILD_ID__)
      : Promise.resolve(true);
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

  // チャンネル同士の移動は URL では判断できないので、content script が読んだ
  // チャンネル ID で比べる。
  browser.runtime.onMessage.addListener((message, sender) => {
    if (!isChannelUpdate(message)) return;
    const tabId = sender.tab?.id;
    void readOwner().then((owner) => {
      if (
        owner !== null &&
        owner.tabId === tabId &&
        hasLeftPanelChannel(owner, message.channelId)
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
