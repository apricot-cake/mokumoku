import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { PageSnapshot } from "../../utils/snapshot.ts";
import { SidepanelApp } from "./sidepanel-app.tsx";

const DAY = 24 * 60 * 60 * 1000;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

function video(id: string, views: number, days: number) {
  return {
    id,
    title: `動画 ${id}`,
    views,
    ageMs: days * DAY,
    ageText: `${days} 日前`,
  };
}

/**
 * パネルを描画する。読み取りの問い合わせには `response` を返し、それ以外
 * （追加読み込み・中止）は `onMessage` に任せる。
 */
async function render(
  response: unknown,
  onMessage: (message: { type: string }) => Promise<unknown> = () =>
    Promise.resolve(undefined),
): Promise<ReturnType<typeof vi.spyOn>> {
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((() =>
    Promise.resolve([
      { id: 1 } as Browser.tabs.Tab,
    ])) as typeof fakeBrowser.tabs.query);
  const send = vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(((
    _tabId: number,
    message: { type: string },
  ) => {
    if (message.type !== "mokumoku:snapshot-request") return onMessage(message);
    return response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response);
  }) as typeof fakeBrowser.tabs.sendMessage);
  await act(async () => {
    root.render(<SidepanelApp />);
  });
  return send;
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  if (!found) throw new Error(`「${label}」のボタンがない`);
  return found;
}

function status(): string {
  return container.querySelector('header [role="status"]')?.textContent ?? "";
}

const RANGE_LABELS: Record<string, string> = {
  all: "Manual",
  week: "Past week",
  month: "Past month",
  quarter: "Past 3 months",
  halfYear: "Past 6 months",
  year: "Past year",
  custom: "Custom range…",
};

function combobox(label: string, scope: ParentNode = container): HTMLElement {
  const element = scope.querySelector<HTMLSelectElement>(
    label === "Load range" ? "select" : 'select[aria-label="Unit"]',
  );
  if (!element) throw new Error("選択欄がありません。");
  return element;
}

async function chooseOption(
  trigger: HTMLElement,
  label: string,
): Promise<void> {
  const select = trigger as HTMLSelectElement;
  const option = [...select.options].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!option) throw new Error("選択肢がありません。");
  await act(async () => {
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function chooseRange(
  period: string,
  scope: ParentNode = container,
): Promise<void> {
  const label = RANGE_LABELS[period];
  if (!label) throw new Error(`未知の読み込み範囲: ${period}`);
  await chooseOption(combobox("Load range", scope), label);
}

function expectRange(period: string, scope: ParentNode = container): void {
  expect(selectedText(combobox("Load range", scope))).toBe(
    RANGE_LABELS[period],
  );
}

function selectedText(trigger: HTMLElement): string | undefined {
  return (trigger as HTMLSelectElement).selectedOptions[0]?.textContent?.trim();
}

beforeEach(() => {
  fakeBrowser.reset();
  container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe("SidepanelApp", () => {
  it("content script が応答しないタブでは案内を出す", async () => {
    await render(new Error("Receiving end does not exist."));
    expect(container.textContent).toContain(
      "Open the Videos tab of a YouTube channel",
    );
    expect(container.textContent).toContain("reload the page");
  });
  it("新しい順でなければ切り替えを促す", async () => {
    const snapshot: PageSnapshot = { kind: "not-newest", channel: "c" };
    await render(snapshot);
    expect(container.textContent).toContain("Sort the videos by Latest");
  });
  it("倍率順の一覧と、公開1日未満の欄を出す", async () => {
    const typical = [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map((days) =>
      video(`d${days}`, Math.round(10000 * Math.sqrt(days)), days),
    );
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [
        video("fresh", 500, 0.25),
        video("rising", 60000, 3),
        ...typical,
      ],
    };
    await render(snapshot);
    expect(container.querySelector("h1")?.textContent).toBe("Example");
    const ranked = [...container.querySelectorAll("ol > li")];
    expect(ranked).toHaveLength(11);
    expect(ranked[0]?.textContent).toContain("動画 rising");
    expect(ranked[0]?.querySelector("a")?.getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=rising",
    );
    const fresh = container.querySelector("section");
    expect(fresh?.textContent).toContain("Less than a day old");
    expect(fresh?.textContent).toContain("動画 fresh");
  });
  it("期間指定なしのときは、ヘッダーのボタンで1回分を読み込む", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    const send = await render(snapshot, () => Promise.resolve("timeout"));
    expect(status()).toBe("1 videos loaded");
    expect(button("Load more").disabled).toBe(false);
    await act(async () => {
      button("Load more").click();
    });
    expect(send).toHaveBeenCalledWith(1, { type: "mokumoku:load-more" });
    expect(status()).toBe("Couldn't load more videos. Try again.");
  });
  it("期間を選ぶと、それより古い動画を一覧から隠し、永続保存しない", async () => {
    const typical = [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map((days) =>
      video(`d${days}`, Math.round(10000 * Math.sqrt(days)), days),
    );
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: false,
      empty: false,
      videos: typical,
    };
    await render(snapshot);
    await chooseRange("month");
    const ranked = [...container.querySelectorAll("ol > li")].map(
      (row) => row.textContent ?? "",
    );
    expect(ranked).toHaveLength(6);
    expect(ranked.some((row) => row.includes("動画 d60"))).toBe(false);
    expect(container.textContent).toContain("4 older videos are hidden");
    expect(await fakeBrowser.storage.local.get("period")).toEqual({});
  });
  it("旧版で保存した期間は使わず、期間指定なしから開く", async () => {
    await fakeBrowser.storage.local.set({ period: "week" });
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    const send = await render(snapshot);
    expectRange("all");
    expect(send).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: "mokumoku:load-more" }),
    );
  });
  it("期間を選んでから閉じて開き直すと、期間指定なしに戻り自動読み込みを始めない", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    const send = await render(snapshot, () => Promise.resolve("timeout"));
    await chooseRange("month");
    expect(send).toHaveBeenCalledWith(1, {
      type: "mokumoku:load-more",
      untilAgeMs: 30.4375 * DAY,
    });
    await act(async () => root.render(null));
    send.mockClear();
    await act(async () => root.render(<SidepanelApp />));
    expectRange("all");
    expect(send).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: "mokumoku:load-more" }),
    );
  });
  it("一覧更新と別タブでは期間を保ち、動画とライブを往復すると期間指定なしに戻す", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    let pageUrl = "https://www.youtube.com/@example/videos";
    vi.spyOn(fakeBrowser.tabs, "get").mockImplementation((() =>
      Promise.resolve({
        id: 1,
        url: pageUrl,
      } as Browser.tabs.Tab)) as typeof fakeBrowser.tabs.get);
    let finishLoad: (value: string) => void = () => {};
    const pendingLoad = new Promise<string>((resolve) => {
      finishLoad = resolve;
    });
    const send = await render(snapshot, (message) =>
      message.type === "mokumoku:load-more"
        ? pendingLoad
        : Promise.resolve(undefined),
    );
    await chooseRange("month");
    expect(container.querySelector("header progress")).not.toBeNull();
    await act(async () => {
      await fakeBrowser.runtime.onMessage.trigger(
        { type: "mokumoku:snapshot", snapshot },
        { tab: { id: 1 } as Browser.tabs.Tab },
        vi.fn(),
      );
      await fakeBrowser.tabs.onUpdated.trigger(1, { url: pageUrl }, {
        id: 1,
        url: pageUrl,
      } as Browser.tabs.Tab);
      await fakeBrowser.tabs.onUpdated.trigger(1, { status: "complete" }, {
        id: 1,
        url: pageUrl,
      } as Browser.tabs.Tab);
      await fakeBrowser.tabs.onUpdated.trigger(
        2,
        { url: "https://www.youtube.com/@other/streams" },
        { id: 2 } as Browser.tabs.Tab,
      );
    });
    expectRange("month");
    pageUrl = "https://www.youtube.com/@example/streams";
    await act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(1, { url: pageUrl }, {
        id: 1,
        url: pageUrl,
      } as Browser.tabs.Tab);
    });
    expectRange("all");
    expect(container.querySelector("header progress")).toBeNull();
    expect(send).toHaveBeenCalledWith(1, { type: "mokumoku:load-cancel" });
    await act(async () => {
      finishLoad("cancelled");
      await fakeBrowser.runtime.onMessage.trigger(
        { type: "mokumoku:snapshot", snapshot },
        { tab: { id: 1 } as Browser.tabs.Tab },
        vi.fn(),
      );
    });
    expectRange("all");
    expect(container.querySelector("header progress")).toBeNull();
    const loadRequests = () =>
      send.mock.calls.filter(
        (call: unknown[]) =>
          (call[1] as { type: string }).type === "mokumoku:load-more",
      );
    expect(loadRequests()).toHaveLength(1);
    await chooseRange("week");
    expect(loadRequests()).toHaveLength(2);
    for (const section of ["videos", "streams"]) {
      pageUrl = `https://www.youtube.com/@example/${section}`;
      await act(async () => {
        await fakeBrowser.tabs.onUpdated.trigger(1, { url: pageUrl }, {
          id: 1,
          url: pageUrl,
        } as Browser.tabs.Tab);
        await fakeBrowser.runtime.onMessage.trigger(
          { type: "mokumoku:snapshot", snapshot },
          { tab: { id: 1 } as Browser.tabs.Tab },
          vi.fn(),
        );
      });
      expectRange("all");
      expect(container.querySelector("header progress")).toBeNull();
      expect(loadRequests()).toHaveLength(2);
    }
  });
  it.each(["month", "all"])(
    "選択範囲 %s の後に一覧の続きが現れた場合も、自動読み込みの条件を守る",
    async (period) => {
      const snapshot: PageSnapshot = {
        kind: "ready",
        channel: "Example",
        canLoadMore: false,
        empty: false,
        videos: [],
      };
      const send = await render(snapshot, () => Promise.resolve("timeout"));
      await chooseRange(period);
      expectRange(period);
      const loadRequests = () =>
        send.mock.calls.filter(
          (call: unknown[]) =>
            (call[1] as { type: string }).type === "mokumoku:load-more",
        );
      expect(loadRequests()).toHaveLength(0);
      const update = {
        ...snapshot,
        canLoadMore: true,
        videos: [video("a", 100, 2)],
      };
      await act(async () => {
        await fakeBrowser.runtime.onMessage.trigger(
          { type: "mokumoku:snapshot", snapshot: update },
          { tab: { id: 1 } as Browser.tabs.Tab },
          vi.fn(),
        );
      });
      expect(loadRequests()).toHaveLength(period === "month" ? 1 : 0);
      // 読み込み失敗後に継続要素が入れ替わっても、勝手に再開しない。
      await act(async () => {
        await fakeBrowser.runtime.onMessage.trigger(
          {
            type: "mokumoku:snapshot",
            snapshot: { ...update, canLoadMore: false },
          },
          { tab: { id: 1 } as Browser.tabs.Tab },
          vi.fn(),
        );
      });
      await act(async () => {
        await fakeBrowser.runtime.onMessage.trigger(
          {
            type: "mokumoku:snapshot",
            snapshot: {
              ...update,
              videos: [...update.videos, video("b", 200, 3)],
            },
          },
          { tab: { id: 1 } as Browser.tabs.Tab },
          vi.fn(),
        );
      });
      expect(loadRequests()).toHaveLength(period === "month" ? 1 : 0);
    },
  );
  it("期間を選ぶと、期間を超える動画まで自動で読み込み、中止と再開ができる", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    let finish: (value: string) => void = () => {};
    const send = await render(snapshot, (message) =>
      message.type === "mokumoku:load-more"
        ? new Promise<string>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(undefined),
    );
    expect(send).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: "mokumoku:load-more",
      }),
    );
    await chooseRange("month");
    expect(send).toHaveBeenCalledWith(1, {
      type: "mokumoku:load-more",
      untilAgeMs: 30.4375 * DAY,
    });
    expect(status()).toBe("Loading… 1 videos");
    expect(container.querySelector("header progress")).not.toBeNull();
    await act(async () => {
      button("Cancel").click();
    });
    expect(send).toHaveBeenCalledWith(1, { type: "mokumoku:load-cancel" });
    await act(async () => {
      finish("cancelled");
    });
    expect(status()).toBe("Loading canceled");
    expect(container.querySelector("header progress")).toBeNull();
    for (const canLoadMore of [false, true]) {
      await act(async () => {
        await fakeBrowser.runtime.onMessage.trigger(
          {
            type: "mokumoku:snapshot",
            snapshot: { ...snapshot, canLoadMore },
          },
          { tab: { id: 1 } as Browser.tabs.Tab },
          vi.fn(),
        );
      });
    }
    expect(
      send.mock.calls.filter(
        (call: unknown[]) =>
          (call[1] as { type: string }).type === "mokumoku:load-more",
      ),
    ).toHaveLength(1);
    await act(async () => {
      button("Load the rest").click();
    });
    await act(async () => {
      finish("limit");
    });
    expect(status()).toBe("Stopped after loading 500 videos");
  });
  it("期間を超える動画まで読み込み済みなら、読み込まずに件数を示す", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map((days) =>
        video(`d${days}`, Math.round(10000 * Math.sqrt(days)), days),
      ),
    };
    const send = await render(snapshot);
    await chooseRange("week");
    expect(send).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: "mokumoku:load-more",
      }),
    );
    expect(status()).toBe("4 videos in range");
    expect(
      container.querySelectorAll('header button:not([role="combobox"])'),
    ).toHaveLength(0);
  });
  it("最後まで読み込んだらボタンを無効にする", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: false,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    await render(snapshot);
    expect(button("All loaded").disabled).toBe(true);
  });
  it("基準を出せないときは読み込みを促す", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      empty: false,
      videos: [video("a", 100, 2)],
    };
    await render(snapshot);
    expect(container.textContent).toContain("Not enough videos to compare");
  });
});
