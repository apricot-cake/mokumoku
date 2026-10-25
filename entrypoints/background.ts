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
  panelOwnerKey,
  panelPageKey,
} from "../utils/panel-page.ts";

// service worker の休止後も、各タブのパネルを独立して管理する。
const PANEL_PATH = "sidepanel.html";

async function readOwner(tabId: number): Promise<PanelOwner | null> {
  const key = panelOwnerKey(tabId);
  const stored = await browser.storage.session.get(key);
  const owner = stored[key];
  return isPanelOwner(owner) ? owner : null;
}

function prepareTab(tabId: number): Promise<void> {
  return browser.sidePanel.setOptions({
    tabId,
    path: `${PANEL_PATH}?tabId=${tabId}`,
    enabled: true,
  });
}

function isPanelUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  const base = browser.runtime.getURL(`/${PANEL_PATH}`);
  if (value === base) return true;
  if (!value.startsWith(`${base}?tabId=`)) return false;
  const parameter = value.slice(`${base}?tabId=`.length);
  return (
    /^(0|[1-9]\d*)$/.test(parameter) && Number.isSafeInteger(Number(parameter))
  );
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
    await browser.storage.session.remove(panelOwnerKey(owner.tabId));
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

  // Chrome がタブ別パネルを自動的に隠し、元のタブで復元する。
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void (async () => {
    // 以前の版で保存していた読み込み範囲は、今後のパネルでは使わない。
    await browser.storage.local.remove("period");
    const stored = await browser.storage.session.get("panelOwner");
    if (isPanelOwner(stored.panelOwner)) await closePanel(stored.panelOwner);
    await browser.storage.session.remove("panelOwner");
    await browser.sidePanel.setOptions({ enabled: false });
    const tabs = await browser.tabs.query({});
    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined ? undefined : prepareTab(tab.id),
      ),
    );
  })().catch(console.error);
  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) void prepareTab(tab.id).catch(console.error);
  });

  browser.sidePanel.onOpened.addListener(({ windowId, tabId: panelTabId }) => {
    void (async () => {
      if (panelTabId === undefined) return;
      const tab = await browser.tabs.get(panelTabId);
      const tabId = panelTabId;
      const owner: PanelOwner = {
        tabId,
        windowId,
        panelTabId,
        pageKey: panelPageKey(tab.url),
        channelId: null,
      };
      // チャンネルの応答より先に所有者を保存し、その間の移動でも閉じられるようにする。
      await browser.storage.session.set({ [panelOwnerKey(tabId)]: owner });
      const channelId = await readTabChannelId(tabId);
      const current = await readOwner(tabId);
      // 問い合わせ中にパネルが閉じた場合、古い所有者を書き戻さない。
      if (
        current?.tabId === tabId &&
        current.windowId === windowId &&
        current.pageKey === owner.pageKey &&
        current.panelTabId === owner.panelTabId
      ) {
        await browser.storage.session.set({
          [panelOwnerKey(tabId)]: { ...current, channelId },
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
      !isPanelUrl(sender.url)
    )
      return;
    return __MOKUMOKU_LOCAL_DEPLOY__
      ? checkLocalBuild(__MOKUMOKU_BUILD_ID__)
      : Promise.resolve(true);
  });

  // パネルを開いたページから別のページへ移ったら閉じる。
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    void prepareTab(tabId).catch(console.error);
    if (change.url === undefined && change.status !== "loading") return;
    void readOwner(tabId).then((owner) => {
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
    if (tabId === undefined) return;
    void readOwner(tabId).then((owner) => {
      if (
        owner !== null &&
        owner.tabId === tabId &&
        hasLeftPanelChannel(owner, message.channelId)
      )
        return closePanel(owner);
    });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.remove(panelOwnerKey(tabId));
  });

  // 手動で閉じたタブの記録だけを消す。
  browser.sidePanel.onClosed.addListener(({ tabId, windowId }) => {
    if (tabId === undefined) return;
    void readOwner(tabId).then((owner) => {
      if (owner?.windowId === windowId && owner.panelTabId === tabId)
        return browser.storage.session.remove(panelOwnerKey(tabId));
    });
  });
});
