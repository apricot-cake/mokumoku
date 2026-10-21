import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type Browser, launch } from "puppeteer-core";
import { findChromePath } from "./chrome-path.ts";
import { secureDevBrowserProfile } from "./dev-browser-profile.ts";

/** `pnpm run build` の出力。開発用 Chrome にはこれを読み込む。 */
export const extensionOutput = path.resolve(
  import.meta.dirname,
  "..",
  ".output",
  "chrome-mv3",
);

export function devBrowserProfile(): string {
  return path.resolve(
    process.env.MOKUMOKU_DEV_PROFILE ||
      path.join(homedir(), ".mokumoku-ext-profile"),
  );
}

export function devBrowserArgs(profile: string): string[] {
  return [
    `--user-data-dir=${profile}`,
    "--profile-directory=Default",
    "--restore-last-session",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ];
}

/** 接続を起動元の匿名 pipe に限定し、既存 Chrome には接続しない。 */
export async function launchDevBrowser(headless: boolean): Promise<Browser> {
  const profile = devBrowserProfile();
  secureDevBrowserProfile(profile);
  return await launch({
    executablePath: process.env.MOKUMOKU_CHROME || findChromePath(),
    userDataDir: profile,
    headless,
    pipe: true,
    enableExtensions: true,
    defaultViewport: null,
    protocolTimeout: 30000,
    ignoreDefaultArgs: [
      // SDK の環境変数からも Chrome の sandbox を無効にさせない。
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--password-store=basic",
      "--use-mock-keychain",
      "--hide-scrollbars",
    ],
    args: [
      ...devBrowserArgs(profile).filter(
        (arg) =>
          !arg.startsWith("--user-data-dir=") &&
          !(headless && arg === "--restore-last-session"),
      ),
      ...(headless ? ["--window-size=1280,720"] : []),
    ],
  }).catch((cause) => {
    throw new Error(
      "開発用 Chrome を起動できません。手動確認用の Chrome が開いていれば閉じてから再実行してください。",
      { cause },
    );
  });
}

/**
 * ビルド済みの拡張機能を読み込む。CDP での読み込みはこの Chrome の起動中だけ
 * 有効で、プロファイルには残らない。
 */
export async function loadExtension(browser: Browser): Promise<string> {
  if (!fs.existsSync(path.join(extensionOutput, "manifest.json")))
    throw new Error(
      "拡張機能のビルドがありません。先に pnpm run build を実行してください。",
    );
  return await browser.installExtension(extensionOutput);
}

/** 各コマンドが所有する Chrome は、正常終了・失敗のどちらでも終了する。 */
export async function withDevBrowser<T>(
  run: (browser: Browser) => Promise<T>,
): Promise<T> {
  const browser = await launchDevBrowser(true);
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}
