import { browser } from "wxt/browser";

const CONTENT_SCRIPT = "/content-scripts/content.js";
const MATCHES = ["https://www.youtube.com/*"];

async function inject(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT],
  });
}

/**
 * 開発サーバー専用。WXT は content script が変わると対象のタブを
 * `tabs.reload` で再読み込みするので、追加で読み込んだ動画などページの状態が
 * 消える。再読み込みの代わりに新しい content script を注入する。古い
 * content script は、WXT の ContentScriptContext が新しいものの起動を検知して
 * 止める。
 *
 * background でタブを再読み込みするのは WXT の開発用コードだけなので、
 * `tabs.reload` ごと差し替える。公開版のビルドには含めない。
 */
export function injectContentScriptInsteadOfReload(): void {
  const tabs = browser.tabs as unknown as {
    reload: (tabId?: number) => Promise<void>;
  };
  tabs.reload = async (tabId) => {
    if (tabId !== undefined) await inject(tabId);
  };
}

/**
 * 開発サーバーとローカル配備ビルド用。拡張機能全体が読み込み直されると
 * （開発サーバーでの background や locale の変更、配備による自己リロード）、
 * 開いているタブの content script が切れる。background の起動時に開いている
 * YouTube のタブへ入れ直し、ページを再読み込みせずに使えるようにする。
 */
export async function injectContentScriptIntoOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ url: MATCHES });
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined ? undefined : inject(tab.id).catch(() => {}),
    ),
  );
}
