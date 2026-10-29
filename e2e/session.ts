import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, Page, WebWorker } from "puppeteer-core";
import { expect, vi } from "vitest";
import type { browser as ExtensionBrowser } from "wxt/browser";
import {
  launchDevBrowser,
  loadExtension,
} from "../scripts/managed-dev-browser.ts";

export const RANGE =
  'header [role="combobox"][aria-label="読み込み範囲"], header [role="combobox"][aria-label="Load range"]';
export const UNIT =
  'header [role="combobox"][aria-label="単位"], header [role="combobox"][aria-label="Unit"]';
export const LABELS = {
  all: ["期間指定なし", "No date range"],
  week: ["直近1週間", "Past week"],
  month: ["直近1か月", "Past month"],
  halfYear: ["直近6か月", "Past 6 months"],
  year: ["直近1年", "Past year"],
  custom: ["カスタム…", "Custom range…"],
} as const;

export async function choose(
  page: Page,
  selector: string,
  labels: readonly string[],
) {
  await page.locator(selector).click();
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("aria-expanded") ===
      "true",
    {},
    selector,
  );
  const id = await page.$eval(selector, (element) =>
    element.getAttribute("aria-controls"),
  );
  const options = await page.$$(`[id=${JSON.stringify(id)}] [role="option"]`);
  try {
    for (const option of options) {
      if (
        labels.includes(
          (await option.evaluate((element) => element.textContent))?.trim() ??
            "",
        )
      ) {
        await option.asLocator().click();
        await waitRange(page, selector, labels);
        return;
      }
    }
    throw new Error(`選択項目がありません: ${labels.join(" / ")}`);
  } finally {
    await Promise.all(options.map((option) => option.dispose()));
  }
}

export async function waitRange(
  page: Page,
  selector: string,
  labels: readonly string[],
) {
  await page.waitForFunction(
    (selector, labels) => {
      const element = document.querySelector(selector);
      return (
        element?.getAttribute("aria-expanded") === "false" &&
        labels.includes(
          element
            .querySelector('[data-slot="select-value"]')
            ?.textContent?.trim() ?? "",
        )
      );
    },
    {},
    selector,
    labels,
  );
}

export async function rows(page: Page) {
  return page.$$eval('li a[href*="/watch?v="]', (elements) =>
    elements.map((element) => ({
      id: new URL((element as HTMLAnchorElement).href).searchParams.get("v"),
      title: element.querySelector("p[title]")?.getAttribute("title"),
    })),
  );
}

export async function settle(page: Page) {
  // MutationObserver の400ms集約とReact側の反映を観測するための安定待ち。
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 650)));
}

export async function createSession(options: {
  url: string;
  offline?: boolean;
  prepare?: (page: Page) => Promise<void>;
  preparePanel?: (page: Page) => Promise<void>;
  beforeClose?: () => void;
  diagnostics?: () => unknown;
  resultsDirectory: string;
}) {
  const profile = await fs.mkdtemp(path.join(tmpdir(), "mokumoku-e2e-"));
  let browser: Browser | undefined;
  const errors: string[] = [];
  try {
    browser = await launchDevBrowser(
      true,
      profile,
      options.offline ? ["--host-resolver-rules=MAP * ~NOTFOUND"] : [],
    );
    const extensionId = await loadExtension(browser);
    const worker = await (
      await browser.waitForTarget(
        (target) =>
          target.type() === "service_worker" &&
          target.url() === `chrome-extension://${extensionId}/background.js`,
      )
    ).worker();
    if (!worker) throw new Error("service worker がありません。");
    const root = await browser.target().createCDPSession();
    const page = await browser.newPage();
    await options.prepare?.(page);
    const observed = new Set<Page>();
    const observe = (page: Page) => {
      if (observed.has(page)) return;
      observed.add(page);
      page.on("pageerror", (error) => errors.push(String(error)));
    };
    observe(page);
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    const tabId = await ownerTabId(worker, options.url);
    await vi.waitUntil(
      async () =>
        worker.evaluate(async (tabId) => {
          const api = (
            globalThis as unknown as { chrome: typeof ExtensionBrowser }
          ).chrome;
          const options = await api.sidePanel.getOptions({ tabId });
          return (
            options.enabled && options.path === `sidepanel.html?tabId=${tabId}`
          );
        }, tabId),
      { timeout: 5000, interval: 100 },
    );
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`;
    const app = {
      browser,
      worker,
      page,
      tabId,
      errors,
      panel: undefined as Page | undefined,
      async open() {
        const { targetInfos } = await root.send("Target.getTargets", {
          filter: [{ type: "tab" }],
        });
        const tab = targetInfos.find((target) => target.url === page.url());
        if (!tab) throw new Error("所有タブの target がありません。");
        await root.send("Extensions.triggerAction", {
          id: extensionId,
          targetId: tab.targetId,
        });
        const target = await app.browser.waitForTarget(
          (candidate) => candidate.url() === panelUrl,
        );
        const panel = await target.asPage();
        panel.setDefaultTimeout(5000);
        await options.preparePanel?.(panel);
        observe(panel);
        app.panel = panel;
        await panel.waitForSelector("#root > *");
        // onOpened の処理も通っていることを確認する。
        await expect
          .poll(async () =>
            worker.evaluate(async (tabId) => {
              const api = (
                globalThis as unknown as { chrome: typeof ExtensionBrowser }
              ).chrome;
              const key = `panelOwner:${tabId}`;
              return (await api.storage.session.get(key))[key] !== undefined;
            }, tabId),
          )
          .toBe(true);
        return panel;
      },
      async closePanel() {
        await worker.evaluate(async (tabId) => {
          const api = (
            globalThis as unknown as { chrome: typeof ExtensionBrowser }
          ).chrome;
          await api.sidePanel.close({ tabId });
        }, tabId);
        await expect
          .poll(() =>
            app.browser.targets().some((target) => target.url() === panelUrl),
          )
          .toBe(false);
      },
      async artifacts(name: string) {
        const directory = path.resolve(
          options.resultsDirectory,
          name.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 120),
        );
        await fs.mkdir(directory, { recursive: true });
        const state = {
          chrome: await app.browser.version(),
          pages: [] as { url: string; error?: string }[],
          errors,
          details: options.diagnostics?.(),
        };
        for (const [index, current] of [...observed].entries()) {
          if (current.isClosed()) continue;
          const entry = {
            url: current.url(),
            error: undefined as string | undefined,
          };
          state.pages.push(entry);
          try {
            await current.screenshot({
              path: path.join(directory, `${index}.png`),
              fullPage: true,
            });
            await fs.writeFile(
              path.join(directory, `${index}.html`),
              await current.content(),
            );
          } catch (error) {
            entry.error = String(error);
          }
        }
        await fs.writeFile(
          path.join(directory, "diagnostics.json"),
          JSON.stringify(state, null, 2),
        );
      },
      async dispose() {
        options.beforeClose?.();
        try {
          await app.browser.close();
        } finally {
          await removeProfile(profile);
        }
      },
    };
    return app;
  } catch (error) {
    try {
      await browser?.close();
    } finally {
      await removeProfile(profile);
    }
    throw error;
  }
}

async function ownerTabId(worker: WebWorker, url: string) {
  const id = await worker.evaluate(async (url) => {
    const api = (globalThis as unknown as { chrome: typeof ExtensionBrowser })
      .chrome;
    return (await api.tabs.query({})).find((tab) => tab.url === url)?.id;
  }, url);
  if (id === undefined) throw new Error("所有タブを特定できません。");
  return id;
}

async function removeProfile(profile: string) {
  const absolute = await fs.realpath(profile);
  const parent = await fs.realpath(tmpdir());
  if (
    path.dirname(absolute) !== parent ||
    !path.basename(absolute).startsWith("mokumoku-e2e-")
  )
    throw new Error(`一時プロファイルの範囲外です: ${absolute}`);
  await fs.rm(absolute, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}

export type Session = Awaited<ReturnType<typeof createSession>>;
