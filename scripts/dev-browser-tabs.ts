// 手動確認用 Chrome で開いていたタブを、次の起動で開き直すための記録。
//
// Chrome 自身の復元（--restore-last-session）は正常に終了したときしか効かない。
// 手動確認用 Chrome は保持プロセスや開発サーバーを止めたときに強制終了される
// ことがあるので、保持プロセスがタブの URL を記録しておき、起動時に開き直す。
import fs from "node:fs";
import path from "node:path";
import type { Browser } from "puppeteer-core";

const FILE_NAME = "mokumoku-tabs.json";

/** 開き直す対象のタブ。拡張機能や Chrome 自身のページは除く。 */
export function restorableUrls(urls: readonly string[]): string[] {
  return urls.filter((url) => /^https?:\/\//.test(url));
}

export function readSavedTabs(profile: string): string[] {
  try {
    const saved: unknown = JSON.parse(
      fs.readFileSync(path.join(profile, FILE_NAME), "utf8"),
    );
    return Array.isArray(saved)
      ? restorableUrls(saved.filter((url) => typeof url === "string"))
      : [];
  } catch {
    return [];
  }
}

/**
 * 開いているタブを記録する。ウィンドウを閉じるとタブが1枚ずつ消えてから
 * 終了するので、開き直す対象が1枚もないときは前回の記録を残す。
 */
export function saveTabs(profile: string, urls: readonly string[]): void {
  const tabs = restorableUrls(urls);
  if (tabs.length === 0) return;
  fs.writeFileSync(path.join(profile, FILE_NAME), JSON.stringify(tabs));
}

// タブを閉じ終えてからウィンドウが閉じるまでの間に、空に近い一覧を
// 記録しないよう、変化が落ち着いてから記録する。
const RECORD_DELAY_MS = 2000;

/** 前回開いていたタブを開き直す。起動時の新しいタブは1枚目に使う。 */
export async function restoreTabs(
  browser: Browser,
  profile: string,
): Promise<void> {
  const urls = readSavedTabs(profile);
  if (urls.length === 0) return;
  const [initial] = await browser.pages();
  await Promise.all(
    urls.map(async (url, index) => {
      const page = index === 0 && initial ? initial : await browser.newPage();
      // 読み込みの完了は待たない。読み込めないページがあっても起動は続ける。
      void page.goto(url).catch(() => {});
    }),
  );
}

/** タブの変化が落ち着くたびに記録する。戻り値で記録をやめる。 */
export function recordTabs(browser: Browser, profile: string): () => void {
  let timer: NodeJS.Timeout | undefined;
  const record = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!browser.connected) return;
      saveTabs(
        profile,
        browser
          .targets()
          .filter((target) => target.type() === "page")
          .map((target) => target.url()),
      );
    }, RECORD_DELAY_MS);
  };
  browser.on("targetcreated", record);
  browser.on("targetchanged", record);
  browser.on("targetdestroyed", record);
  return () => clearTimeout(timer);
}
