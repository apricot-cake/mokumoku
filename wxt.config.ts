import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// バンドルした依存のライセンス文を配布物に同梱する。Vite の build.license は
// ビルド1回分しか書かないが、WXT はエントリポイントのグループごとに Vite を
// 走らせるので、各回を JSON で出させて最後に1つの Markdown へまとめる。
const licensePartsDir = "licenses/.parts";
const licenseFile = "licenses/third-party.md";
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
  // Chrome 137 以降は `--load-extension` を無視するので、WXT にブラウザを
  // 起動させても拡張機能は読み込まれない。開発サーバーの起動後に、
  // 開発専用プロファイルの Chrome へ CDP で読み込む（下の server:started）。
  webExt: {
    disabled: true,
  },
  manifest: {
    // ブラウザのロケールにメッセージがないときの言語。locales/en.yml が対応する。
    default_locale: "en",
    name: "mokumoku",
    description: "__MSG_extensionDescription__",
    // パネルで選んだ表示期間を保存する。
    permissions: ["storage"],
    action: {
      default_title: "mokumoku",
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
  }),
});
