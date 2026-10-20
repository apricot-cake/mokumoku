import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// バンドルした依存のライセンス文を配布物に同梱する。Vite の build.license は
// ビルド1回分しか書かないが、WXT はエントリポイントのグループごとに Vite を
// 走らせるので、各回を JSON で出させて最後に1つの Markdown へまとめる。
const licensePartsDir = "licenses/.parts";
const licenseFile = "licenses/third-party.md";

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
  // 起動させても拡張機能は読み込まれない。開発版は .output から手で読み込む。
  webExt: {
    disabled: true,
  },
  manifest: {
    // ブラウザのロケールにメッセージがないときの言語。locales/en.yml が対応する。
    default_locale: "en",
    name: "mokumoku",
    description: "__MSG_extensionDescription__",
    action: {
      default_title: "mokumoku",
    },
  },
  hooks: {
    "vite:build:extendConfig": (entrypoints, viteConfig) => {
      const group = entrypoints.map((entrypoint) => entrypoint.name).join("+");
      viteConfig.build ??= {};
      viteConfig.build.license = {
        fileName: `${licensePartsDir}/${group}.json`,
      };
    },
    "build:done": (wxt) => mergeLicenseParts(wxt.config.outDir),
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
