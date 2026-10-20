import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  // wxt.config.ts を読み、テストもビルドと同じ Vite 設定と別名で動かす。
  plugins: [WxtVitest()],
  test: {
    // DOM の読み取りはブラウザと同じ意味のセレクタ照合が要るので、happy-dom で動かす。
    environment: "happy-dom",
    // WXT の偽ブラウザは browser.i18n.getMessage を実装しないので、locales/en.yml から埋める。
    setupFiles: ["./test/i18n.ts"],
  },
});
