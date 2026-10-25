import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// バンドルした依存のライセンス文を配布物に同梱する。Vite の build.license は
// ビルド1回分しか書かないが、WXT はエントリポイントのグループごとに Vite を
// 走らせるので、各回を JSON で出させて最後に1つの Markdown へまとめる。
const licensePartsDir = "licenses/.parts";
const licenseFile = "licenses/third-party.md";
// メインのプロファイル向けのローカル配備ビルド（pnpm run deploy:local）。
// 配備済みのビルドを問い合わせて自分を読み込み直す仕組みと、そのための
// 固定の拡張機能 ID・nativeMessaging 権限を持たせる。
const localDeploy = process.env.MOKUMOKU_BUILD_KIND === "local";
const buildId = localDeploy ? (process.env.MOKUMOKU_BUILD_ID ?? "") : "";
if (localDeploy && buildId === "") {
  throw new Error("ローカル配備ビルドには MOKUMOKU_BUILD_ID が必要です。");
}

// 開発サーバーは変更のたびに一部のエントリポイントだけを再ビルドするので、
// ライセンス文はまとめられない。配布用のビルドに限って同梱する。
let bundleLicenses = true;

type LicenseEntry = {
  name: string;
  version: string;
  identifier?: string;
  text?: string;
};

async function mergeLicenseParts(outDir: string): Promise<void> {
  const partsDir = join(outDir, licensePartsDir);
  const entries = new Map<string, LicenseEntry>();
  for (const part of await readdir(partsDir)) {
    const list: LicenseEntry[] = JSON.parse(
      await readFile(join(partsDir, part), "utf-8"),
    );
    for (const entry of list) {
      entries.set(`${entry.name}@${entry.version}`, entry);
    }
  }
  await rm(partsDir, { recursive: true });

  let markdown =
    "# Licenses\n\nmokumoku bundles the following third-party packages.\n";
  for (const [, entry] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    const identifier = entry.identifier ? ` (${entry.identifier})` : "";
    markdown += `\n## ${entry.name} - ${entry.version}${identifier}\n`;
    if (entry.text) markdown += `\n${entry.text}\n`;
  }
  await mkdir(join(outDir, "licenses"), { recursive: true });
  await writeFile(join(outDir, licenseFile), markdown);
}

export default defineConfig({
  // locales/<言語>.yml から _locales/<言語>/messages.json と #i18n の型を生成する。
  modules: ["@wxt-dev/i18n/module", "@wxt-dev/module-react"],
  // ローカル配備ビルドは配布用の出力と分け、配備スクリプトが共有の出力へ移す。
  ...(localDeploy
    ? { outDir: resolve(import.meta.dirname, ".output", "local") }
    : {}),
  // Chrome 137 以降は `--load-extension` を無視するので、WXT にブラウザを
  // 起動させても拡張機能は読み込まれない。開発サーバーの起動後に、
  // 開発専用プロファイルの Chrome へ CDP で読み込む（下の server:started）。
  webExt: {
    disabled: true,
  },
  manifest: {
    // パネルの実際の開閉通知（onOpened/onClosed）で所有タブを管理する。
    minimum_chrome_version: "142",
    // ブラウザのロケールにメッセージがないときの言語。locales/en.yml が対応する。
    default_locale: "en",
    name: "mokumoku",
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    // ローカル配備ビルドは固定の公開鍵を持たせ、拡張機能 ID を
    // ffedhpkiimfjkcfkpmfidldaiidgfmbi に保つ。Native Messaging Host はこの ID
    // だけを許可する。Chrome ウェブストアは新規アイテムの manifest に key が
    // あるパッケージを受け付けないので、配布用のビルドには含めない。
    // 公開鍵で秘密情報ではないので、秘密情報検査の対象から外す（行末の注記）。
    ...(localDeploy
      ? {
          key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz+3bnFGS4E3V2hV3E47d39dFMNUYHkyLqyadNigIDURxdf+HDPW2SbwPKFHjakeiYwA8wm+yQr8/Hdt4TqiSVm5MoNzBpgrEJzfZquQ0FE3KWl+bL+c/R+jgZSexbw0BHiiVtJfa1mu9BwjFmq8pWEeDLscPRCbAI7zMNPJhSOUf6NB8kR406OHdid3ZBqzQU/d+yTjOoaZBLFKKF4s4pKdLqGYsO2mli9jirPtBdqiCWOaLLg8q/p1NEhpdl84Hp6Jn9buR0fPFoFgnn1O454HXnuNojTXUTHLinCDmelDsq1oDs5L282KQMTr7o4/u3nPoWJPKKiTU0rlEMQJ84wIDAQAB", // gitleaks:allow
        }
      : {}),
    description: "__MSG_extensionDescription__",
    // タブごとのパネル情報をセッション中だけ保持する。
    permissions: [
      "storage",
      // ローカル配備ビルドは、読み込み直したあとに開いているタブへ
      // content script を入れ直す（scripting）。
      ...(localDeploy ? (["nativeMessaging", "scripting"] as const) : []),
    ],
    // パネルを開いたページから移ったかを判定するため、タブの URL を読む。
    // content script と同じ範囲なので、インストール時の警告は増えない。
    host_permissions: ["https://www.youtube.com/*"],
    action: {
      default_title: "mokumoku",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
      },
    },
  },
  hooks: {
    ready: (wxt) => {
      bundleLicenses = wxt.config.command === "build";
    },
    "vite:build:extendConfig": (entrypoints, viteConfig) => {
      if (!bundleLicenses) return;
      const group = entrypoints.map((entrypoint) => entrypoint.name).join("+");
      viteConfig.build ??= {};
      viteConfig.build.license = {
        fileName: `${licensePartsDir}/${group}.json`,
      };
    },
    "build:done": (wxt) =>
      bundleLicenses ? mergeLicenseParts(wxt.config.outDir) : undefined,
    "server:started": () => {
      // 開発用 Chrome は開発サーバーとは別に動き、ウィンドウを閉じるまで残る。
      // 起動に失敗しても開発サーバーは止めない。
      const child = spawn(
        process.execPath,
        [join(import.meta.dirname, "scripts", "dev-browser.ts"), "--dev"],
        { stdio: "inherit" },
      );
      child.on("exit", (code) => {
        if (code !== 0)
          console.warn(
            "[mokumoku] 開発用 Chrome を開けませんでした。開いている開発用 Chrome を閉じてから pnpm run browser:dev を実行してください。",
          );
      });
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __MOKUMOKU_LOCAL_DEPLOY__: JSON.stringify(localDeploy),
      __MOKUMOKU_BUILD_ID__: JSON.stringify(buildId),
    },
  }),
});
