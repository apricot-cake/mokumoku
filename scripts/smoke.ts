// 開発用 Chrome をヘッドレスで起動し、実際の YouTube チャンネルの「動画」タブで
// content script の読み取りとサイドパネルの描画を確認する。ページには何も書き込まない。
//
//   pnpm run smoke [チャンネルの動画タブの URL]
import type { browser as Browser } from "wxt/browser";
import { rankVideos } from "../utils/ranking.ts";
import { isPageSnapshot, SNAPSHOT_REQUEST } from "../utils/snapshot.ts";
import { loadExtension, withDevBrowser } from "./managed-dev-browser.ts";

const DEFAULT_URL = "https://www.youtube.com/@GoogleJapan/videos";
const url = process.argv[2] ?? DEFAULT_URL;
const CARD =
  "ytd-browse:not([hidden]) ytd-rich-grid-renderer ytd-rich-item-renderer";

await withDevBrowser(async (browser) => {
  const extensionId = await loadExtension(browser);
  const workerTarget = await browser.waitForTarget(
    (target) =>
      target.type() === "service_worker" &&
      target.url() === `chrome-extension://${extensionId}/background.js`,
    { timeout: 10000 },
  );
  const worker = await workerTarget.worker();
  if (!worker) throw new Error("拡張機能の service worker に接続できません。");

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(CARD, { timeout: 20000 });

    // content script の読み直し間隔より長く待ち、描画途中の一覧を読まない。
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // tabs 権限がないのでタブの URL は読めない。パネルと同じく表示中のタブに問い合わせる。
    await page.bringToFront();
    const snapshot = await worker.evaluate(async (type) => {
      // worker の中では拡張機能 API が chrome として見える。
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      const [tab] = await api.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (tab?.id === undefined) return null;
      return await api.tabs.sendMessage(tab.id, { type });
    }, SNAPSHOT_REQUEST);
    if (!isPageSnapshot(snapshot))
      throw new Error(
        `content script の応答が不正です: ${JSON.stringify(snapshot)}`,
      );
    if (snapshot.kind !== "ready")
      throw new Error(`一覧を読めませんでした: ${snapshot.kind}`);
    const cards = await page.$$eval(CARD, (elements) => elements.length);
    console.log(
      `[mokumoku] ${snapshot.channel}: カード ${cards} 件のうち ${snapshot.videos.length} 件を読み取った`,
    );
    if (snapshot.videos.length === 0)
      throw new Error("再生数と経過時間を読めた動画がありません。");

    const ranking = rankVideos(snapshot.videos);
    if (ranking.kind !== "ranked")
      throw new Error("基準を出せる本数を読み込めませんでした。");
    for (const [index, video] of ranking.videos.slice(0, 5).entries()) {
      console.log(
        `  ${index + 1}. ×${video.ratio.toFixed(1)} ${video.views}回 ${video.ageText} ${video.title}`,
      );
    }

    // ツールバーのアイコンと同じ経路でサイドパネルを開き、一覧の中身を確かめる。
    const root = await browser.target().createCDPSession();
    // 既定の一覧はタブの target を含まないので、種類を指定して取る。
    const { targetInfos } = await root.send("Target.getTargets", {
      filter: [{ type: "tab" }],
    });
    const [tab, ...others] = targetInfos.filter(
      (info) => info.url === page.url(),
    );
    if (!tab || others.length > 0)
      throw new Error("検証用タブを一意に特定できません。");
    await root.send("Extensions.triggerAction", {
      id: extensionId,
      targetId: tab.targetId,
    });
    const panelTarget = await browser.waitForTarget(
      (target) =>
        target.url() === `chrome-extension://${extensionId}/sidepanel.html`,
      { timeout: 10000 },
    );
    const panel = await panelTarget.asPage();
    const errors: string[] = [];
    panel.on("pageerror", (error) => errors.push(String(error)));
    await panel.waitForSelector("ol > li", { timeout: 10000 });
    const shown = await panel.evaluate(() => ({
      channel: document.querySelector("h1")?.textContent ?? "",
      rows: [...document.querySelectorAll("ol > li")]
        .slice(0, 3)
        .map((row) => row.textContent ?? ""),
      count: document.querySelectorAll("ol > li").length,
    }));
    if (errors.length > 0)
      throw new Error(`サイドパネルでエラーが出ました: ${errors.join("\n")}`);
    if (
      shown.channel !== snapshot.channel ||
      shown.count !== ranking.videos.length
    )
      throw new Error(
        `サイドパネルの表示が読み取り結果と一致しません: ${JSON.stringify(shown)}`,
      );
    console.log(
      `[mokumoku] サイドパネル: ${shown.channel} の ${shown.count} 件を表示`,
    );
    for (const row of shown.rows) console.log(`  ${row}`);
  } finally {
    await page.close();
  }
});
