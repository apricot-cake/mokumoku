import fs from "node:fs/promises";
import type { Page } from "puppeteer-core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";
import type { browser as ExtensionBrowser } from "wxt/browser";
import {
  isWithinPeriod,
  type PeriodId,
  periodMaxAgeMs,
} from "../utils/period.ts";
import { rankVideos } from "../utils/ranking.ts";
import { isPageSnapshot, SNAPSHOT_REQUEST } from "../utils/snapshot.ts";
import { liveNetwork } from "./live-network.ts";
import {
  choose,
  createSession,
  LABELS,
  RANGE,
  rows,
  type Session,
  settle,
  UNIT,
  waitRange,
} from "./session.ts";

const CARD =
  "ytd-browse:not([hidden]) ytd-rich-grid-renderer ytd-rich-item-renderer";
const url =
  process.env.MOKUMOKU_LIVE_URL ??
  "https://www.youtube.com/@GoogleJapan/videos";
const parsed = new URL(url);
if (
  parsed.origin !== "https://www.youtube.com" ||
  !/\/(videos|streams)\/?$/.test(parsed.pathname)
)
  throw new Error(
    "MOKUMOKU_LIVE_URLにはYouTubeチャンネルの動画・ライブタブを指定してください。",
  );
const network = liveNetwork();
let app: Session | undefined;
let panel: Page;
let failed = false;

beforeAll(async () => {
  app = await createSession({
    url,
    resultsDirectory: ".output/live-results",
    prepare: network.attach,
    preparePanel: network.attach,
    diagnostics: () => network.state,
  });
  await app.page.waitForSelector(CARD, { timeout: 20000 });
});
afterAll(async () => {
  console.log(
    `[test:live] 通信数: ページ${network.state.documents}、一覧API${network.state.browseRequests}、画像等の取得抑制${network.state.blockedAssets}`,
  );
  try {
    network.finish();
    await app?.dispose();
  } finally {
    await fs.mkdir(".output/live-results", { recursive: true });
    await fs.writeFile(
      ".output/live-results/network.json",
      JSON.stringify(network.state, null, 2),
    );
    console.log(`[test:live] 通信診断: ${JSON.stringify(network.state)}`);
  }
  if (!failed) expect(network.state.failure).toBe("");
});
beforeEach(async (context) => {
  if (failed || network.state.failure)
    context.skip("前の失敗後は追加アクセスをしません。");
  const session = current();
  await session.page.bringToFront();
  panel = await session.open();
  await waitRange(panel, RANGE, LABELS.all);
});
afterEach(async (context) => {
  if (!app) return;
  if (context.task.result?.state === "skip") return;
  try {
    if (
      context.task.result?.state === "fail" ||
      network.state.failure ||
      app.errors.length
    ) {
      failed = true;
      network.stop("テスト失敗後の追加アクセスを停止しました。");
      await app.artifacts(context.task.name);
    }
    expect(network.state.failure).toBe("");
    expect(app.errors).toEqual([]);
  } finally {
    if (app.panel && !app.panel.isClosed()) await app.closePanel();
  }
});

function current() {
  if (!app) throw new Error("Chrome が起動していません。");
  return app;
}
async function ready() {
  const session = current();
  let response: unknown;
  await expect
    .poll(
      async () => {
        if (network.state.failure) throw new Error(network.state.failure);
        const challenge = await session.page.evaluate(() =>
          [
            ...document.querySelectorAll(
              'form[action*="sorry"], #captcha-form, iframe[src*="recaptcha"], ytd-enforcement-message-view-model',
            ),
          ].some((element) => element.getClientRects().length > 0),
        );
        if (
          challenge ||
          !session.page.url().startsWith("https://www.youtube.com/")
        ) {
          network.stop(
            "認証・同意・アクセス制限の画面を検出したため停止しました。自動操作では解除しません。",
          );
          throw new Error(network.state.failure);
        }
        response = await session.worker.evaluate(
          async ({ tabId, type }) => {
            const api = (
              globalThis as unknown as { chrome: typeof ExtensionBrowser }
            ).chrome;
            return await api.tabs
              .sendMessage(tabId, { type })
              .catch(() => null);
          },
          { tabId: session.tabId, type: SNAPSHOT_REQUEST },
        );
        return isPageSnapshot(response) ? response.kind : null;
      },
      { timeout: 20000 },
    )
    .toBe("ready");
  if (!isPageSnapshot(response) || response.kind !== "ready")
    throw new Error("動画一覧を読み取れません。");
  return response;
}
async function expectedIds(
  period: PeriodId = "all",
  custom?: { value: number; unit: "day" | "month" | "year" },
) {
  const snapshot = await ready();
  const ranking = rankVideos(snapshot.videos);
  if (ranking.kind !== "ranked")
    throw new Error("公開から1日以上たった動画が8本以上必要です。");
  return ranking.videos
    .filter((video) => isWithinPeriod(video, period, custom))
    .map((video) => video.id);
}
async function expectList(
  period: PeriodId = "all",
  custom?: { value: number; unit: "day" | "month" | "year" },
) {
  const ids = await expectedIds(period, custom);
  await expect
    .poll(async () => (await rows(panel)).map((row) => row.id))
    .toEqual(ids);
  await expect
    .poll(() =>
      panel.$eval('[role="status"]', (element) => element.textContent),
    )
    .toMatch(new RegExp(`^${ids.length}\\s*(本|videos)$`));
}
async function safePeriod(period: "week" | "month" | "halfYear" | "year") {
  const snapshot = await ready();
  const limit = periodMaxAgeMs(period);
  // 実サイトでは追加取得が不要な期間だけ適用する。自動取得は固定E2Eで検証する。
  return (
    !snapshot.canLoadMore ||
    snapshot.videos.some((video) => limit !== null && video.ageMs > limit)
  );
}

test("実DOMの動画とパネルのチャンネル・動画ID・順位・件数が一致する", async () => {
  const snapshot = await ready();
  expect(await current().page.$$(CARD)).not.toHaveLength(0);
  expect(await panel.$eval("h1", (element) => element.textContent)).toBe(
    snapshot.channel,
  );
  await expectList();
});

test("期間指定なしは追加読み込みせず、旧保存値も引き継がない", async () => {
  const session = current();
  const before = (await ready()).videos.map((video) => video.id);
  await session.closePanel();
  await session.worker.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: typeof ExtensionBrowser })
      .chrome;
    await api.storage.local.set({ period: "year" });
  });
  try {
    panel = await session.open();
    await waitRange(panel, RANGE, LABELS.all);
    await settle(panel);
    expect((await ready()).videos.map((video) => video.id)).toEqual(before);
    expect(await panel.$$('header [role="progressbar"]')).toHaveLength(0);
    expect(
      await panel.$eval("header", (element) => element.textContent),
    ).not.toMatch(/さらに読み込む|Load more/);
  } finally {
    await session.worker.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: typeof ExtensionBrowser })
        .chrome;
      await api.storage.local.remove("period");
    });
  }
});

test("読み込み済みの期間で絞り込み、日・月・年のカスタム入力を適用する", async (context) => {
  const before = (await ready()).videos.map((video) => video.id);
  const initialRequests = network.state.browseRequests;
  const verified: string[] = [];
  for (const period of ["halfYear", "month", "year"] as const) {
    if (!(await safePeriod(period))) {
      context.annotate(`${period}: 追加取得が必要なため固定E2Eで検証`);
      continue;
    }
    const scrollBefore = await current().page.evaluate(() => scrollY);
    await choose(panel, RANGE, LABELS[period]);
    await expectList(period);
    expect(await current().page.evaluate(() => scrollY)).toBe(scrollBefore);
    verified.push(period);
  }
  for (const unit of ["day", "month", "year"] as const) {
    const period =
      unit === "day" ? "week" : unit === "month" ? "month" : "year";
    if (!(await safePeriod(period))) {
      context.annotate(`${unit}: 追加取得が必要なため固定E2Eで検証`);
      continue;
    }
    await choose(panel, RANGE, LABELS.all);
    await choose(panel, RANGE, LABELS.custom);
    await panel.locator('input[type="number"]').fill("1");
    await choose(
      panel,
      UNIT,
      { day: ["日", "days"], month: ["月", "months"], year: ["年", "years"] }[
        unit
      ],
    );
    expect((await ready()).videos.map((video) => video.id)).toEqual(before);
    await panel.locator('button[type="submit"]').click();
    await expectList("custom", { value: 1, unit });
    verified.push(unit);
  }
  expect(
    verified.length,
    "読み込み済みの範囲だけでは期間を検証できませんでした。",
  ).toBeGreaterThan(0);
  await settle(panel);
  expect(network.state.browseRequests).toBe(initialRequests);
  expect((await ready()).videos.map((video) => video.id)).toEqual(before);
});

test("動画とライブを1往復し、パネルを維持して期間だけ初期化する", async (context) => {
  const original = new URL(current().page.url()).pathname.endsWith("/streams")
    ? "streams"
    : "videos";
  for (const section of [
    original === "videos" ? "streams" : "videos",
    original,
  ]) {
    if (await safePeriod("week")) await choose(panel, RANGE, LABELS.week);
    else await choose(panel, RANGE, LABELS.custom);
    const links = await current().page.$$(
      "ytd-browse:not([hidden]) yt-tab-shape",
    );
    let clicked = false;
    try {
      for (const link of links) {
        if (
          (section === "streams"
            ? ["ライブ", "Live"]
            : ["動画", "Videos"]
          ).includes(
            (await link.evaluate((element) => element.textContent))?.trim() ??
              "",
          )
        ) {
          await link.asLocator().click();
          clicked = true;
          break;
        }
      }
    } finally {
      await Promise.all(links.map((link) => link.dispose()));
    }
    expect(clicked, `${section}タブがあるチャンネルを指定してください。`).toBe(
      true,
    );
    await current().page.waitForFunction(
      (section) => location.pathname.endsWith(`/${section}`),
      {},
      section,
    );
    await ready();
    expect(panel.isClosed()).toBe(false);
    await waitRange(panel, RANGE, LABELS.all);
    expect(await panel.$$('header [role="progressbar"]')).toHaveLength(0);
  }
  context.annotate(
    "遷移中の一瞬の表示は固定E2Eで確実に観測。実サイトは遷移後の状態を確認。",
  );
});

test("別タブに引き継がず、戻ると同じパネルと期間を保つ", async () => {
  await choose(panel, RANGE, LABELS.custom);
  const session = current();
  const other = await session.browser.newPage();
  try {
    await other.bringToFront();
    await expect
      .poll(() => panel.evaluate(() => document.visibilityState))
      .toBe("hidden");
    await session.page.bringToFront();
    await expect
      .poll(() => panel.evaluate(() => document.visibilityState))
      .toBe("visible");
    await waitRange(panel, RANGE, LABELS.custom);
    await session.closePanel();
    panel = await session.open();
    await waitRange(panel, RANGE, LABELS.all);
  } finally {
    await other.close();
  }
});

test("別チャンネルへの移動でパネルを閉じる", async () => {
  const otherChannel = parsed.pathname.startsWith("/@YouTube/")
    ? "GoogleJapan"
    : "YouTube";
  await current().page.goto(`https://www.youtube.com/@${otherChannel}/videos`, {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => panel.isClosed()).toBe(true);
});
