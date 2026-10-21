import { launchDevBrowser, loadExtension } from "./managed-dev-browser.ts";

// 拡張機能の読み込みと Chrome の保持には pipe を使い、TCP ポートは開かない。
// CDP で読み込んだ拡張機能は pipe が切れると外れるので、ウィンドウを閉じるまで保持する。
const browser = await launchDevBrowser(false);
try {
  const disconnected = new Promise<void>((resolve) =>
    browser.once("disconnected", () => resolve()),
  );
  await loadExtension(browser);
  if (!browser.connected) throw new Error("手動確認用 Chrome が終了しました。");
  process.send?.("ready");
  await disconnected;
} finally {
  await browser.close();
}
