import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type Browser, launch } from "puppeteer-core";
import { findChromePath } from "./chrome-path.ts";
import { secureDevBrowserProfile } from "./dev-browser-profile.ts";

/**
 * 開発用 Chrome に読み込む拡張機能。`pnpm run build` の出力か、開発サーバー
 * （`pnpm dev`）の出力。後者は変更のたびに自動で再読み込みされる。
 */
export function extensionOutput(dev: boolean): string {
  return path.resolve(
    import.meta.dirname,
    "..",
    ".output",
    dev ? "chrome-mv3-dev" : "chrome-mv3",
  );
}

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
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ];
}

/** 接続を起動元の匿名 pipe に限定し、既存 Chrome には接続しない。 */
export async function launchDevBrowser(
  headless: boolean,
  profile = devBrowserProfile(),
  additionalArgs: string[] = [],
): Promise<Browser> {
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
      // 起動時の about:blank を開かせない。前回のタブは手動確認用 Chrome の
      // 保持プロセスが開き直す（dev-browser-tabs.ts）。
      "about:blank",
    ],
    args: [
      ...devBrowserArgs(profile).filter(
        (arg) => !arg.startsWith("--user-data-dir="),
      ),
      ...(headless ? ["--window-size=1280,720"] : []),
      ...additionalArgs,
    ],
  }).catch((cause) => {
    throw new Error(
      "開発用 Chrome を起動できません。手動確認用の Chrome が開いていれば閉じてから再実行してください。",
      { cause },
    );
  });
}

async function isExtensionEnabled(
  browser: Browser,
  extensionId: string,
): Promise<boolean | undefined> {
  const root = await browser.target().createCDPSession();
  try {
    // puppeteer-core の型にはまだないが、Chrome の CDP は Extensions.getExtensions を持つ。
    const { extensions } = (await root.send(
      "Extensions.getExtensions" as never,
    )) as { extensions: { id: string; enabled: boolean }[] };
    return extensions.find((item) => item.id === extensionId)?.enabled;
  } finally {
    await root.detach();
  }
}

/**
 * ビルド済みの拡張機能を CDP で読み込む。拡張機能 ID は読み込み元のパスで
 * 決まる。
 *
 * 同じパスを再インストールするだけでは、manifest が更新されても service
 * worker が以前のソースを実行する場合がある。いったん外して読み込み直し、
 * キャッシュされた background と無効化された拡張機能をどちらも残さない。
 */
export async function loadExtension(
  browser: Browser,
  dev = false,
): Promise<string> {
  const output = extensionOutput(dev);
  if (!fs.existsSync(path.join(output, "manifest.json")))
    throw new Error(
      dev
        ? "開発サーバーの出力がありません。pnpm dev を実行してください。"
        : "拡張機能のビルドがありません。先に pnpm run build を実行してください。",
    );
  const extensionId = await browser.installExtension(output);
  await browser.uninstallExtension(extensionId);
  return await browser.installExtension(output);
}

const RELOAD_POLL_MS = 500;

/**
 * 開発サーバーは background や locale の変更で `runtime.reload()` を呼ぶ。
 * CDP で読み込んだ拡張機能はそこで無効になって戻らないので、無効になったら
 * 読み込み直して再読み込みを完了させる。
 */
export function keepExtensionEnabled(
  browser: Browser,
  extensionId: string,
  dev: boolean,
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const check = async () => {
    if ((await isExtensionEnabled(browser, extensionId)) === false) {
      await loadExtension(browser, dev);
      console.log("[mokumoku] 拡張機能を読み込み直した");
    }
  };
  const schedule = () => {
    if (stopped || !browser.connected) return;
    timer = setTimeout(() => {
      check()
        .catch((error: unknown) => {
          if (browser.connected)
            console.warn("[mokumoku] 拡張機能の状態を確認できません。", error);
        })
        .finally(schedule);
    }, RELOAD_POLL_MS);
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
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
