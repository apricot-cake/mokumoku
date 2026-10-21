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

/** タブの content script が読んだチャンネル ID。応答がなければ null。 */
async function readTabChannelId(tabId: number): Promise<string | null> {
  const channelId: unknown = await browser.tabs
    .sendMessage(tabId, { type: CHANNEL_REQUEST })
    .catch(() => null);
  return typeof channelId === "string" ? channelId : null;
}

async function closePanel(owner: PanelOwner): Promise<void> {
  try {
    await browser.sidePanel.close(
      owner.panelTabId === null
        ? { windowId: owner.windowId }
        : { tabId: owner.panelTabId },
    );
    await browser.storage.session.remove(OWNER_KEY);
  } catch (error) {
    console.warn("mokumoku のパネルを閉じられませんでした。", error);
  }
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

  // 開閉は Chrome 標準のアイコン動作に任せる。onClicked は Chrome が直接
  // パネルを開く経路では発火しないので、所有者は実際の onOpened で記録する。
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.sidePanel.onOpened.addListener(({ windowId, tabId: panelTabId }) => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, windowId });
      if (tab?.id === undefined) return;
      const tabId = tab.id;
      const previous = await readOwner();
      if (previous && previous.windowId !== windowId)
        await closePanel(previous);
      const owner: PanelOwner = {
        tabId,
        windowId,
        panelTabId: panelTabId ?? null,
        pageKey: panelPageKey(tab.url),
        channelId: null,
      };
      // チャンネルの応答より先に所有者を保存し、その間の移動でも閉じられるようにする。
      await browser.storage.session.set({ [OWNER_KEY]: owner });
      const channelId = await readTabChannelId(tabId);
      const current = await readOwner();
      // 問い合わせ中にパネルが閉じた場合、古い所有者を書き戻さない。
      if (
        current?.tabId === tabId &&
        current.windowId === windowId &&
        current.pageKey === owner.pageKey &&
        current.panelTabId === owner.panelTabId
      ) {
        await browser.storage.session.set({
          [OWNER_KEY]: { ...current, channelId },
        });
      }
      // ローカル配備ビルドは、Chrome が直接開く経路でも更新を確認する。
      if (__MOKUMOKU_LOCAL_DEPLOY__)
        void checkLocalBuild(__MOKUMOKU_BUILD_ID__);
    })().catch((error: unknown) => {
      console.error(
        "mokumoku のパネルの所有タブを記録できませんでした。",
        error,
      );
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
  browser.sidePanel.onClosed.addListener(({ tabId, windowId }) => {
    void readOwner().then((owner) => {
      if (owner?.windowId === windowId && owner.panelTabId === (tabId ?? null))
        return browser.storage.session.remove(OWNER_KEY);
    });
  });
});
