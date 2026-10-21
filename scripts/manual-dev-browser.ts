import { recordTabs, restoreTabs } from "./dev-browser-tabs.ts";
import {
  devBrowserProfile,
  keepExtensionEnabled,
  launchDevBrowser,
  loadExtension,
} from "./managed-dev-browser.ts";

const dev = process.argv.includes("--dev");
const profile = devBrowserProfile();

// 拡張機能の読み込みと Chrome の保持には pipe を使い、TCP ポートは開かない。
// CDP で読み込んだ拡張機能は pipe が切れると外れるので、ウィンドウを閉じるまで保持する。
const browser = await launchDevBrowser(false);
try {
  const disconnected = new Promise<void>((resolve) =>
    browser.once("disconnected", () => resolve()),
  );
  const extensionId = await loadExtension(browser, dev);
  const stopKeeping = dev
    ? keepExtensionEnabled(browser, extensionId, dev)
    : () => {};
  // 拡張機能を読み込んでから開くので、開き直したタブでも content script が動く。
  await restoreTabs(browser, profile);
  const stopRecording = recordTabs(browser, profile);
  if (!browser.connected) throw new Error("手動確認用 Chrome が終了しました。");
  process.send?.("ready");
  await disconnected;
  stopKeeping();
  stopRecording();
} finally {
  await browser.close();
}
