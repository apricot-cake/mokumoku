import { browser } from "wxt/browser";

export default defineBackground(() => {
  // ツールバーのアイコンでサイドパネルを開閉する。
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
