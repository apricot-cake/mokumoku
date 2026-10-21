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
  // 前回の確認や手動操作で選んだ読み込み範囲を「手動」に戻し、全件を表示させる。
  const setPeriod = (period: string) =>
    worker.evaluate(async (value) => {
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      await api.storage.local.set({ period: value });
    }, period);
  await setPeriod("all");

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

    const statusText = () =>
      panel.$eval(
        'header [role="status"]',
        (element) => element.textContent ?? "",
      );

    // 「手動」のときは、ヘッダーの「さらに読み込む」で動画が増え、
    // ページのスクロール位置が保たれることを確かめる。
    if (snapshot.canLoadMore) {
      const rowCount = () =>
        panel.evaluate(() => document.querySelectorAll("li").length);
      const beforeRows = await rowCount();
      // 一覧の途中を読んでいる状態にしてから頼む。
      const scrollBefore = await page.evaluate(() => {
        window.scrollTo(0, 400);
        return window.scrollY;
      });
      await panel.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find(
          (element) =>
            /さらに読み込む|Load more/.test(element.textContent ?? ""),
        );
        if (!button) throw new Error("さらに読み込むボタンがありません。");
        button.click();
      });
      await panel.waitForFunction(
        (before) => document.querySelectorAll("li").length > before,
        { timeout: 15000 },
        beforeRows,
      );
      const afterRows = await rowCount();
      const scrollAfter = await page.evaluate(() => window.scrollY);
      if (scrollAfter !== scrollBefore)
        throw new Error(
          `追加読み込みの後にスクロール位置が戻っていません: ${scrollBefore} → ${scrollAfter}`,
        );
      console.log(
        `[mokumoku] さらに読み込む: ${beforeRows} 件 → ${afterRows} 件（スクロール位置 ${scrollAfter} を維持）`,
      );
    }

    // 読み込み範囲を選ぶだけで、範囲を超える動画まで自動で読み込む。
    if (snapshot.canLoadMore) {
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await panel.select("header select", "halfYear");
      await panel.waitForSelector("header progress", { timeout: 5000 });
      console.log(`[mokumoku] 直近6か月を選ぶ: ${await statusText()}`);
      await panel.waitForFunction(
        () => document.querySelector("header progress") === null,
        { timeout: 60000 },
      );
      const summary = await statusText();
      if (!/範囲内|in range/.test(summary))
        throw new Error(`期間までの読み込みが完了していません: ${summary}`);
      const scrollAfter = await page.evaluate(() => window.scrollY);
      if (scrollAfter !== scrollBefore)
        throw new Error(
          `期間までの読み込み後にスクロール位置が戻っていません: ${scrollBefore} → ${scrollAfter}`,
        );
      console.log(`[mokumoku] 読み込み完了: ${summary}`);
    }

    // 読み込み範囲を絞ると、それより古い動画が一覧から消え、非表示の件数が出る。
    const rankedBefore = await panel.$$eval("ol > li", (rows) => rows.length);
    await panel.select("header select", "month");
    await panel.waitForFunction(
      (before) => document.querySelectorAll("ol > li").length < before,
      { timeout: 5000 },
      rankedBefore,
    );
    const filtered = await panel.evaluate(() => ({
      count: document.querySelectorAll("ol > li").length,
      note: [...document.querySelectorAll("p")]
        .map((p) => p.textContent ?? "")
        .find((text) => /非表示|hidden/.test(text)),
    }));
    if (!filtered.note) throw new Error("非表示にした件数が表示されません。");
    console.log(
      `[mokumoku] 直近1か月に絞る: ${rankedBefore} 件 → ${filtered.count} 件（${await statusText()}、${filtered.note}）`,
    );
    await setPeriod("all");
  } finally {
    await page.close();
  }
});
