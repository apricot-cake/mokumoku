// 開発用 Chrome をヘッドレスで起動し、実際の YouTube チャンネルの「動画」タブで
// content script の読み取りとサイドパネルの描画を確認する。ページには何も書き込まない。
//
//   pnpm run smoke [チャンネルの動画タブの URL]
import type { Page } from "puppeteer-core";
import type { browser as Browser } from "wxt/browser";
import { type PeriodId, periodMaxAgeMs } from "../utils/period.ts";
import { rankVideos } from "../utils/ranking.ts";
import { isPageSnapshot, SNAPSHOT_REQUEST } from "../utils/snapshot.ts";
import { loadExtension, withDevBrowser } from "./managed-dev-browser.ts";

const DEFAULT_URL = "https://www.youtube.com/@GoogleJapan/videos";
// パネルを閉じる確認で移る先。企業の公式チャンネルの動画タブ。
const OTHER_PAGE_URL = "https://www.youtube.com/@YouTube/videos";
const url = process.argv[2] ?? DEFAULT_URL;
const CARD =
  "ytd-browse:not([hidden]) ytd-rich-grid-renderer ytd-rich-item-renderer";
const RANGE_TRIGGER =
  'header [role="combobox"][aria-label="読み込み範囲"], header [role="combobox"][aria-label="Load range"]';
const UNIT_TRIGGER =
  'header [role="combobox"][aria-label="単位"], header [role="combobox"][aria-label="Unit"]';
const RANGE_LABELS: Record<PeriodId, readonly string[]> = {
  all: ["期間指定なし", "No date range"],
  week: ["直近1週間", "Past week"],
  month: ["直近1か月", "Past month"],
  quarter: ["直近3か月", "Past 3 months"],
  halfYear: ["直近6か月", "Past 6 months"],
  year: ["直近1年", "Past year"],
  custom: ["期間を指定…", "Custom range…"],
};
const UNIT_LABELS = {
  day: ["日", "days"],
  month: ["月", "months"],
  year: ["年", "years"],
} as const;

/** portal 内の項目を待ち、利用者と同じクリック操作で選ぶ。 */
async function chooseOption(
  panel: Page,
  trigger: string,
  labels: readonly string[],
): Promise<void> {
  await panel.locator(trigger).click();
  await panel.waitForFunction(
    (selector) => {
      const element = document.querySelector(selector);
      return (
        element?.getAttribute("aria-expanded") === "true" &&
        element.hasAttribute("aria-controls")
      );
    },
    { timeout: 5000 },
    trigger,
  );
  const popupId = await panel.$eval(trigger, (element) =>
    element.getAttribute("aria-controls"),
  );
  if (popupId === null)
    throw new Error("選択欄のポップアップを特定できません。");
  const popup = `[id=${JSON.stringify(popupId)}]`;
  await panel.waitForSelector(`${popup} [role="option"]`, {
    visible: true,
    timeout: 5000,
  });
  const options = await panel.$$(`${popup} [role="option"]`);
  let chosen = false;
  for (const option of options) {
    const label = await option.evaluate((element) =>
      element.textContent?.trim(),
    );
    if (
      label !== undefined &&
      labels.includes(label) &&
      (await option.isVisible())
    ) {
      await option.asLocator().click();
      chosen = true;
      break;
    }
  }
  await Promise.all(options.map((option) => option.dispose()));
  if (!chosen) throw new Error(`選択項目がありません: ${labels.join(" / ")}`);
  await panel
    .waitForFunction(
      (selector, expected) => {
        const element = document.querySelector(selector);
        return (
          element?.getAttribute("aria-expanded") === "false" &&
          expected.includes(
            element
              .querySelector('[data-slot="select-value"]')
              ?.textContent?.trim() ?? "",
          )
        );
      },
      { timeout: 5000 },
      trigger,
      labels,
    )
    .catch(async (error: unknown) => {
      const state = await panel.evaluate(
        (selector) => ({
          trigger: document.querySelector(selector)?.outerHTML,
          options: [...document.querySelectorAll('[role="option"]')].map(
            (option) => ({
              text: option.textContent,
              selected: option.getAttribute("aria-selected"),
            }),
          ),
        }),
        trigger,
      );
      await panel.screenshot({
        path: ".output/shadcn-smoke-select-failed.png",
      });
      throw new Error(
        `項目クリック後に選択が確定しません: ${JSON.stringify(state)}`,
        { cause: error },
      );
    });
}

function chooseRange(panel: Page, period: PeriodId): Promise<void> {
  return chooseOption(panel, RANGE_TRIGGER, RANGE_LABELS[period]);
}

function waitForRange(panel: Page, period: PeriodId): Promise<unknown> {
  return panel.waitForFunction(
    (selector, labels) =>
      labels.includes(
        document
          .querySelector(selector)
          ?.querySelector('[data-slot="select-value"]')
          ?.textContent?.trim() ?? "",
      ),
    { timeout: 10000 },
    RANGE_TRIGGER,
    RANGE_LABELS[period],
  );
}

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
  const readSnapshot = (tabId?: number) =>
    worker.evaluate(
      async ({ tabId: requestedTabId, type }) => {
        const api = (globalThis as unknown as { chrome: typeof Browser })
          .chrome;
        const currentTabId =
          requestedTabId ??
          (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0]
            ?.id;
        if (currentTabId === undefined) return null;
        return await api.tabs
          .sendMessage(currentTabId, { type })
          .catch(() => null);
      },
      { tabId, type: SNAPSHOT_REQUEST },
    );
  const waitForReadySnapshot = async (tabId?: number) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const current = await readSnapshot(tabId);
      if (isPageSnapshot(current)) {
        if (current.kind === "ready") return current;
        throw new Error(`一覧を読めませんでした: ${current.kind}`);
      } else if (current !== null) {
        throw new Error(
          `content script の応答が不正です: ${JSON.stringify(current)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      "動画一覧が読み込み中のまま20秒以内に表示されませんでした。",
    );
  };

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(CARD, { timeout: 20000 });

    // 確認用のタブをアクティブにして、その content script へ問い合わせる。
    await page.bringToFront();
    const snapshot = await waitForReadySnapshot();
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

    // ツールバーのアイコンと同じ経路でサイドパネルを開く。
    const root = await browser.target().createCDPSession();
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    const isPanelUrl = (candidate: string) =>
      candidate === panelUrl || candidate.startsWith(`${panelUrl}?tabId=`);
    const isPanelOpen = () =>
      browser.targets().some((target) => isPanelUrl(target.url()));
    const openPanel = async () => {
      // 既定の一覧はタブの target を含まないので、種類を指定して取る。
      const { targetInfos } = await root.send("Target.getTargets", {
        filter: [{ type: "tab" }],
      });
      const [tab, ...others] = targetInfos.filter(
        (info) => info.url === page.url(),
      );
      if (!tab || others.length > 0)
        throw new Error("検証用タブを一意に特定できません。");
      const ownerTabId = await worker.evaluate(async () => {
        const api = (globalThis as unknown as { chrome: typeof Browser })
          .chrome;
        const [active] = await api.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        return active?.id;
      });
      await root.send("Extensions.triggerAction", {
        id: extensionId,
        targetId: tab.targetId,
      });
      const target = await browser.waitForTarget(
        (candidate) => isPanelUrl(candidate.url()),
        { timeout: 10000 },
      );
      const openedPanel = await target.asPage();
      // target の作成だけでなく、本体の onOpened が所有タブを記録するまで待つ。
      // 古い background が残って開閉管理を通らない場合も、ここで検出する。
      await openedPanel.waitForFunction(
        async (expectedTabId) => {
          const api = (globalThis as unknown as { chrome: typeof Browser })
            .chrome;
          const key = `panelOwner:${expectedTabId}`;
          const stored = await api.storage.session.get(key);
          const panelOwner = stored[key];
          return (
            expectedTabId !== undefined &&
            typeof panelOwner === "object" &&
            panelOwner !== null &&
            "tabId" in panelOwner &&
            panelOwner.tabId === expectedTabId
          );
        },
        { timeout: 5000 },
        ownerTabId,
      );
      return openedPanel;
    };
    const waitPanelClosed = async (reason: string) => {
      const deadline = Date.now() + 5000;
      while (isPanelOpen()) {
        if (Date.now() > deadline) {
          const state = await worker.evaluate(async () => {
            const api = (globalThis as unknown as { chrome: typeof Browser })
              .chrome;
            const panelOwners = await api.storage.session.get(null);
            const [tab] = await api.tabs.query({
              active: true,
              lastFocusedWindow: true,
            });
            if (tab?.id === undefined) return { panelOwners };
            return {
              panelOwners,
              options: await api.sidePanel.getOptions({ tabId: tab.id }),
              channelId: await api.tabs
                .sendMessage(tab.id, { type: "mokumoku:channel-request" })
                .catch(() => null),
            };
          });
          const feed = await page.$eval(
            "head",
            (head) =>
              head
                .querySelector('link[type="application/rss+xml"]')
                ?.getAttribute("href") ?? null,
          );
          throw new Error(
            `${reason}でパネルが閉じません。${JSON.stringify({ state, url: page.url(), feed })}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    const panel = await openPanel();
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

    // 「期間指定なし」のときは、ヘッダーの「さらに読み込む」で動画が増え、
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
      await chooseRange(panel, "halfYear");
      // 読み込み済みの動画がすでに範囲を超えていれば、読み込みは始まらない。
      const started = await panel
        .waitForSelector('header [role="progressbar"]', { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      console.log(
        `[mokumoku] 直近6か月を選ぶ: ${started ? await statusText() : "読み込み済みのため読み込まない"}`,
      );
      await panel.waitForFunction(
        () => document.querySelector('header [role="progressbar"]') === null,
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

    // 任意期間は入力だけでは読み込まず、適用してから指定範囲を表示する。
    await chooseRange(panel, "custom");
    const customNumber = 'header input[type="number"]';
    await panel.waitForSelector(customNumber, { timeout: 5000 });
    for (const [value, unit] of [
      ["35", "day"],
      ["2", "month"],
    ] as const) {
      await panel.locator(customNumber).fill(value);
      await chooseOption(panel, UNIT_TRIGGER, UNIT_LABELS[unit]);
      if ((await panel.$('header [role="progressbar"]')) !== null)
        throw new Error("任意期間を適用する前に読み込みが始まりました。");
      await panel.evaluate(() => {
        const apply = [
          ...document.querySelectorAll<HTMLButtonElement>("header button"),
        ].find((element) =>
          /^(適用|Apply)$/.test(element.textContent?.trim() ?? ""),
        );
        if (!apply || apply.disabled)
          throw new Error("任意期間を適用できません。");
        apply.click();
      });
      await panel.waitForFunction(
        () =>
          document.querySelector('header [role="progressbar"]') === null &&
          /範囲内|in range/.test(
            document.querySelector('header [role="status"]')?.textContent ?? "",
          ),
        { timeout: 60000 },
      );
      const applied = await panel.$eval(
        customNumber,
        (element) => (element as HTMLInputElement).value,
      );
      if (applied !== value)
        throw new Error(`任意期間の入力値が変わりました: ${applied}`);
      console.log(
        `[mokumoku] 任意期間 ${value} ${unit} を適用: ${await statusText()}`,
      );
    }
    await chooseRange(panel, "all");
    if ((await panel.$(customNumber)) !== null)
      throw new Error("期間指定なしに戻しても任意期間の入力が残っています。");

    // 読み込み範囲を絞ると、それより古い動画が一覧から消え、非表示の件数が出る。
    const rankedBefore = await panel.$$eval("ol > li", (rows) => rows.length);
    await chooseRange(panel, "month");
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
    // 本物のページ内タブを移り、パネルを閉じずに期間を期間指定なしへ戻す。
    // 一度訪れたページへ戻っても選択済みの期間を復元しない。
    const originalSection = new URL(page.url()).pathname.endsWith("/streams")
      ? "streams"
      : "videos";
    const otherSection = originalSection === "videos" ? "streams" : "videos";
    const moveSection = async (section: string) => {
      try {
        const clicked = await page.evaluate((destination) => {
          const labels =
            destination === "streams" ? ["ライブ", "Live"] : ["動画", "Videos"];
          const tab = [
            ...document.querySelectorAll<HTMLElement>(
              "ytd-browse:not([hidden]) yt-tab-shape",
            ),
          ].find((element) =>
            labels.includes(element.textContent?.trim() ?? ""),
          );
          if (!tab) return false;
          tab.click();
          return true;
        }, section);
        if (!clicked)
          throw new Error(
            `動画・ライブ間の移動を確認できません: ${section} タブがありません。両方あるチャンネルを指定して smoke を実行してください。`,
          );
        await page.waitForFunction(
          (destination) => location.pathname.endsWith(`/${destination}`),
          { timeout: 10000 },
          section,
        );
        await page.waitForSelector(CARD, { timeout: 20000 });
        await waitForReadySnapshot(
          Number(new URL(panel.url()).searchParams.get("tabId")),
        );
        if (panel.isClosed())
          throw new Error("動画・ライブ間の移動でパネルが閉じました。");
        await waitForRange(panel, "all");
        await panel.waitForFunction(
          () => document.querySelector('header [role="progressbar"]') === null,
          { timeout: 15000 },
        );
        console.log(
          `[mokumoku] ${section} へ移動: パネルを維持し、読み込み範囲は期間指定なし（自動読み込みなし）`,
        );
      } finally {
        // 移動後の状態は直前の検査で確認済み。
      }
    };
    await moveSection(otherSection);
    await chooseRange(panel, "week");
    await panel.waitForFunction(
      () => document.querySelector('header [role="progressbar"]') === null,
      { timeout: 60000 },
    );
    await moveSection(originalSection);
    await moveSection(otherSection);
    await moveSection(originalSection);

    // 同じチャンネル内の移動（「ホーム」タブへ）ではパネルを閉じない。
    const movedInChannel = await page.evaluate(() => {
      const home = document.querySelector<HTMLElement>(
        "ytd-browse:not([hidden]) yt-tab-shape",
      );
      if (!home || home.getAttribute("aria-selected") === "true") return false;
      home.click();
      return true;
    });
    if (movedInChannel) {
      await page.waitForFunction(() => !location.pathname.endsWith("/videos"), {
        timeout: 10000,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!isPanelOpen())
        throw new Error("同じチャンネル内の移動でパネルが閉じました。");
      console.log(
        `[mokumoku] 同じチャンネル内の移動（${new URL(page.url()).pathname}）: パネルは開いたまま`,
      );
    }

    // 別のページへ移ったら閉じる。
    await page.goto(OTHER_PAGE_URL, { waitUntil: "domcontentloaded" });
    await waitPanelClosed("別のページへの移動");
    console.log("[mokumoku] 別のページへの移動: パネルが閉じた");

    // 別のタブではパネルを引き継がず、元のタブへ戻ると同じ内容を表示する。
    const restoredPanel = await openPanel();
    await restoredPanel.waitForSelector(RANGE_TRIGGER, { timeout: 10000 });
    await chooseRange(restoredPanel, "week");
    const originalPanelUrl = restoredPanel.url();
    const originalTabId = await worker.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      const [tab] = await api.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      return tab?.id;
    });
    const other = await browser.newPage();
    await other.bringToFront();
    // ヘッドレスではサイドパネル自身の visibilityState は visible のまま。
    // Chrome のタブ別設定、開かれたパネルの対象、読み取り内容を検証する。
    const independentTab = await worker.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      const [active] = await api.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (active?.id === undefined)
        throw new Error("切り替え先のタブがありません。");
      const key = `panelOwner:${active.id}`;
      return {
        id: active.id,
        owner: (await api.storage.session.get(key))[key] ?? null,
        options: await api.sidePanel.getOptions({ tabId: active.id }),
        globalOptions: await api.sidePanel.getOptions({}),
      };
    });
    if (
      independentTab.owner !== null ||
      independentTab.options.tabId !== independentTab.id ||
      independentTab.options.path !==
        `sidepanel.html?tabId=${independentTab.id}` ||
      independentTab.globalOptions.enabled !== false ||
      browser
        .targets()
        .some(
          (target) => target.url() === `${panelUrl}?tabId=${independentTab.id}`,
        )
    )
      throw new Error("別のタブへパネルの状態が引き継がれました。");
    const ownerRetained = await worker.evaluate(async (tabId) => {
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      const key = `panelOwner:${tabId}`;
      return (await api.storage.session.get(key))[key] !== undefined;
    }, originalTabId);
    if (!ownerRetained)
      throw new Error("タブ切り替えで元のパネルの記録が失われました。");
    await restoredPanel.waitForSelector("h1", { timeout: 5000 });
    const originalChannel = await restoredPanel.$eval(
      "h1",
      (element) => element.textContent,
    );
    await other.goto(url, { waitUntil: "domcontentloaded" });
    await other.waitForSelector(CARD, { timeout: 20000 });
    if (
      (await restoredPanel.$eval("h1", (element) => element.textContent)) !==
      originalChannel
    )
      throw new Error("隠れたパネルが別のタブのチャンネルへ切り替わりました。");
    await page.bringToFront();
    if (restoredPanel.isClosed() || restoredPanel.url() !== originalPanelUrl)
      throw new Error("元のタブに戻ったとき別のパネルが表示されました。");
    const rangeAfterReturn = await restoredPanel.$eval(
      RANGE_TRIGGER,
      (element) =>
        element
          .querySelector('[data-slot="select-value"]')
          ?.textContent?.trim() ?? "",
    );
    if (!RANGE_LABELS.week.includes(rangeAfterReturn))
      throw new Error("タブを往復しただけで選択中の期間が変わりました。");
    console.log(
      "[mokumoku] タブ切り替え: 別タブへ状態を引き継がず、元のタブのパネルと内容を維持した",
    );
    await other.close();

    // 以前の版の保存値が残っていても、新しいパネルは期間指定なしで始まる。
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await waitPanelClosed("自動読み込み確認前のページ移動");
    await page.waitForSelector(CARD, { timeout: 20000 });
    await worker.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      await api.storage.local.set({ period: "year" });
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const cardsBeforeRestore = await page.$$eval(
      CARD,
      (elements) => elements.length,
    );
    const periodPanel = await openPanel();
    await waitForRange(periodPanel, "all");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const cardsAfterOpen = await page.$$eval(
      CARD,
      (elements) => elements.length,
    );
    if (
      cardsAfterOpen !== cardsBeforeRestore ||
      (await periodPanel.$('header [role="progressbar"]')) !== null
    )
      throw new Error(
        "期間指定なしで開いたパネルが自動で追加読み込みを始めました。",
      );
    const readPeriodSnapshot = () =>
      readSnapshot(
        Number(new URL(periodPanel.url()).searchParams.get("tabId")),
      );
    const beforeYear = await readPeriodSnapshot();
    if (!isPageSnapshot(beforeYear) || beforeYear.kind !== "ready")
      throw new Error("直近1年の指定前に動画一覧を読めませんでした。");
    const yearAgeMs = periodMaxAgeMs("year");
    if (yearAgeMs === null) throw new Error("直近1年の期間が未定義です。");
    const yearAlreadyLoaded = beforeYear.videos.some(
      (video) => video.ageMs > yearAgeMs,
    );
    const needsYearLoad = beforeYear.canLoadMore && !yearAlreadyLoaded;
    const cardsBeforeYear = await page.$$eval(
      CARD,
      (elements) => elements.length,
    );
    await chooseRange(periodPanel, "year");
    if (needsYearLoad) {
      await page.waitForFunction(
        (before) =>
          document.querySelectorAll(
            "ytd-browse:not([hidden]) ytd-rich-grid-renderer ytd-rich-item-renderer",
          ).length > before,
        { timeout: 60000 },
        cardsBeforeYear,
      );
    }
    await periodPanel.waitForFunction(
      () =>
        document.querySelector('header [role="progressbar"]') === null &&
        /範囲内|in range/.test(
          document.querySelector('header [role="status"]')?.textContent ?? "",
        ),
      { timeout: 60000 },
    );
    const afterYear = await readPeriodSnapshot();
    if (
      !isPageSnapshot(afterYear) ||
      afterYear.kind !== "ready" ||
      (afterYear.canLoadMore &&
        !afterYear.videos.some((video) => video.ageMs > yearAgeMs))
    )
      throw new Error(
        "直近1年を選んでも、年境界または一覧の末尾に届いていません。",
      );
    console.log(
      needsYearLoad
        ? "[mokumoku] 新しいパネルは期間指定なしで開始し、直近1年を選ぶと期間まで追加読み込みした"
        : `[mokumoku] 新しいパネルは期間指定なしで開始し、直近1年の指定は${yearAlreadyLoaded ? "年境界まで読み込み済み" : "一覧の末尾まで読み込み済み"}のため追加読み込みせずに表示した`,
    );
    await worker.evaluate(
      async (tabId) => {
        const api = (globalThis as unknown as { chrome: typeof Browser })
          .chrome;
        await api.sidePanel.close({ tabId });
      },
      Number(new URL(periodPanel.url()).searchParams.get("tabId")),
    );
    await waitPanelClosed("パネルを閉じて開き直す確認");
    const reopened = await openPanel();
    await waitForRange(reopened, "all");
    console.log(
      "[mokumoku] パネルを閉じて開き直す: 読み込み範囲は期間指定なしに戻った",
    );
    await worker.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: typeof Browser }).chrome;
      await api.storage.local.remove("period");
    });
  } finally {
    await page.close();
  }
});
