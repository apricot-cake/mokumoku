import { afterEach, beforeEach, expect, test } from "vitest";
import {
  type App,
  choose,
  createApp,
  LABELS,
  RANGE,
  rows,
  settle,
  UNIT,
  waitRange,
} from "./browser.ts";
import { CARD, serveFixture } from "./youtube-fixture.ts";

let app: App | undefined;
beforeEach(async () => {
  app = await createApp();
});
afterEach(async (context) => {
  if (!app) return;
  try {
    if (context.task.result?.state === "fail" || app.errors.length > 0)
      await app.artifacts(context.task.name);
    expect(app.errors).toEqual([]);
  } finally {
    await app.dispose();
    app = undefined;
  }
});

function current() {
  if (!app) throw new Error("Chrome が起動していません。");
  return app;
}

test("期間指定なしは既存の動画だけを表示し、追加読み込みをしない", async () => {
  const app = current();
  const panel = await app.open();
  await waitRange(panel, RANGE, LABELS.all);
  await expect.poll(() => rows(panel)).toHaveLength(8);
  const items = await rows(panel);
  expect(items[0]?.title).toBe("注目動画");
  expect(items.map((item) => item.id)).not.toContain("fixture-0");
  expect(
    await panel.$eval('[role="status"]', (element) => element.textContent),
  ).toMatch(/^8\s*(本|videos)$/);
  await settle(panel);
  expect(app.fixture.requests).toEqual([]);
  expect(await panel.$$("header button[type=submit]")).toHaveLength(0);
  expect(await panel.evaluate(() => document.body.innerText)).not.toMatch(
    /さらに読み込む|Load more/,
  );
});

test("対応外のページには動画・ライブタブへの案内を表示する", async () => {
  const app = current();
  await app.page.goto("https://www.youtube.com/@fixture/featured");
  const panel = await app.open();
  await expect
    .poll(() => panel.$eval("#root", (element) => element.textContent))
    .toMatch(/「動画」または「ライブ」|Videos.*Live/);
  expect(await rows(panel)).toEqual([]);
});

test("期間を超えたら自動読み込みを止め、スクロール位置と表示件数を保つ", async () => {
  const app = current();
  const panel = await app.open();
  await expect.poll(() => rows(panel)).toHaveLength(8);
  await app.page.evaluate(() => window.scrollTo(0, 200));
  const before = await app.page.evaluate(() => scrollY);
  await choose(panel, RANGE, LABELS.month);
  await expect.poll(() => rows(panel)).toHaveLength(10);
  await expect.poll(() => app.page.evaluate(() => scrollY)).toBe(before);
  await settle(panel);
  expect(app.fixture.requests).toEqual([9]);
  expect(await app.page.$$(CARD)).toHaveLength(12);
  expect((await rows(panel)).map((item) => item.id)).not.toContain(
    "fixture-11",
  );
  expect(
    await panel.$eval('[role="status"]', (element) => element.textContent),
  ).toMatch(/^10\s*(本|videos)$/);
  await choose(panel, RANGE, LABELS.all);
  await expect.poll(() => rows(panel)).toHaveLength(11);
  expect(app.fixture.requests).toEqual([9]);
});

test.each([
  { label: "日", unit: ["日", "days"], count: 1, requests: [] },
  { label: "月", unit: ["月", "months"], count: 10, requests: [9] },
  { label: "年", unit: ["年", "years"], count: 13, requests: [9, 12] },
])(
  "カスタム1$label の適用までは読み込まない",
  async ({ unit, count, requests }) => {
    const app = current();
    const panel = await app.open();
    await expect.poll(() => rows(panel)).toHaveLength(8);
    await choose(panel, RANGE, LABELS.custom);
    await panel.locator('input[type="number"]').fill("1");
    await choose(panel, UNIT, unit);
    await settle(panel);
    expect(app.fixture.requests).toEqual([]);
    expect(await rows(panel)).toHaveLength(8);
    await panel.locator('button[type="submit"]').click();
    await expect.poll(() => rows(panel)).toHaveLength(count);
    await settle(panel);
    expect(app.fixture.requests).toEqual(requests);
  },
);

test("空欄・0・負数・小数ではカスタム期間を適用できない", async () => {
  const app = current();
  const panel = await app.open();
  await choose(panel, RANGE, LABELS.custom);
  for (const value of ["", "0", "-1", "1.5"]) {
    await panel.locator('input[type="number"]').click();
    await panel.keyboard.down("Control");
    await panel.keyboard.press("A");
    await panel.keyboard.up("Control");
    await panel.keyboard.press("Backspace");
    if (value) await panel.keyboard.type(value);
    await expect
      .poll(() =>
        panel.$eval(
          'button[type="submit"]',
          (element) => (element as HTMLButtonElement).disabled,
        ),
      )
      .toBe(true);
    await panel.keyboard.press("Enter");
  }
  await settle(panel);
  expect(app.fixture.requests).toEqual([]);
  expect(await rows(panel)).toHaveLength(8);
});

test("動画からライブへ移ると期間を初期化し、前の読み込みを中止する", async () => {
  const app = current();
  const panel = await app.open();
  await app.page.evaluate(() => window.scrollTo(0, 200));
  app.fixture.hold();
  await choose(panel, RANGE, LABELS.month);
  await expect.poll(() => app.fixture.requests.length).toBe(1);
  await app.page.locator("#streams").click();
  await expect
    .poll(() => panel.$eval("#root", (element) => element.textContent))
    .toMatch(/動画を読み込んでいます|Loading videos/);
  expect(await panel.$$(RANGE)).toHaveLength(0);
  expect(
    await panel.$eval("#root", (element) => element.textContent),
  ).not.toMatch(/比べるための動画|Not enough videos/);
  app.fixture.release();
  await app.page.locator("#finish-navigation").click();
  await waitRange(panel, RANGE, LABELS.all);
  await expect.poll(() => rows(panel)).toHaveLength(8);
  await settle(panel);
  expect(app.fixture.requests).toEqual([9]);
  expect(await app.page.evaluate(() => scrollY)).toBe(0);
  // 旧読み込みが残っていると新しい要求が古いPromiseに束縛される。
  // 移動先でも直ちに次の読み込みを開始・完了できることを確かめる。
  await choose(panel, RANGE, LABELS.month);
  await expect.poll(() => rows(panel)).toHaveLength(10);
  expect(app.fixture.requests).toEqual([9, 9]);
  await choose(panel, RANGE, LABELS.week);
  await app.page.locator("#videos").click();
  await expect
    .poll(() => panel.$eval("#root", (element) => element.textContent))
    .toMatch(/動画を読み込んでいます|Loading videos/);
  await app.page.locator("#finish-navigation").click();
  await waitRange(panel, RANGE, LABELS.all);
  await expect.poll(() => rows(panel)).toHaveLength(8);
});

test("別タブではパネルを隠し、戻ると期間を保持し、開き直すと初期化する", async () => {
  const app = current();
  const panel = await app.open();
  await choose(panel, RANGE, LABELS.week);
  const other = await app.browser.newPage();
  const fixture = await serveFixture(other);
  try {
    await other.goto("https://www.youtube.com/@fixture/streams");
    await other.bringToFront();
    await expect
      .poll(() => panel.evaluate(() => document.visibilityState))
      .toBe("hidden");
    await app.page.bringToFront();
    await expect
      .poll(() => panel.evaluate(() => document.visibilityState))
      .toBe("visible");
    await waitRange(panel, RANGE, LABELS.week);
    await app.closePanel();
    const reopened = await app.open();
    await waitRange(reopened, RANGE, LABELS.all);
  } finally {
    fixture.release();
    await other.close();
  }
});

test("別ページへ移動するとパネルを閉じる", async () => {
  const app = current();
  await app.open();
  await app.page.goto("https://www.youtube.com/watch?v=outside");
  await expect.poll(() => app.panel?.isClosed()).toBe(true);
});
