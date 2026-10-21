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

async function render(response: unknown): Promise<void> {
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((() =>
    Promise.resolve([
      { id: 1 } as Browser.tabs.Tab,
    ])) as typeof fakeBrowser.tabs.query);
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  await act(async () => {
    root.render(<SidepanelApp />);
  });
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

  it("さらに読み込むボタンで表示中のタブに追加読み込みを頼む", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      videos: [video("a", 100, 2)],
    };
    await render(snapshot);
    const send = vi
      .spyOn(fakeBrowser.tabs, "sendMessage")
      .mockImplementation((() =>
        Promise.resolve("timeout")) as typeof fakeBrowser.tabs.sendMessage);
    const button = container.querySelector("header button");
    expect(button?.textContent).toBe("Load more");
    await act(async () => {
      (button as HTMLButtonElement).click();
    });
    expect(send).toHaveBeenCalledWith(1, { type: "mokumoku:load-more" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load more videos",
    );
  });

  it("期間を選ぶと、それより古い動画を一覧から隠して保存する", async () => {
    const typical = [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map((days) =>
      video(`d${days}`, Math.round(10000 * Math.sqrt(days)), days),
    );
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: false,
      videos: typical,
    };
    await render(snapshot);
    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "month";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const ranked = [...container.querySelectorAll("ol > li")].map(
      (row) => row.textContent ?? "",
    );
    expect(ranked).toHaveLength(6);
    expect(ranked.some((row) => row.includes("動画 d60"))).toBe(false);
    expect(container.textContent).toContain("4 older videos are hidden");
    expect(await fakeBrowser.storage.local.get("period")).toEqual({
      period: "month",
    });
  });

  it("保存した期間で開く", async () => {
    await fakeBrowser.storage.local.set({ period: "week" });
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: false,
      videos: [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map((days) =>
        video(`d${days}`, Math.round(10000 * Math.sqrt(days)), days),
      ),
    };
    await render(snapshot);
    await act(async () => {});
    expect(container.querySelector("select")?.value).toBe("week");
    expect(container.querySelectorAll("ol > li")).toHaveLength(4);
  });

  it("最後まで読み込んだらボタンを出さない", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: false,
      videos: [video("a", 100, 2)],
    };
    await render(snapshot);
    expect(container.querySelector("header button")).toBeNull();
    expect(container.textContent).toContain("All videos are loaded");
  });

  it("基準を出せないときは読み込みを促す", async () => {
    const snapshot: PageSnapshot = {
      kind: "ready",
      channel: "Example",
      canLoadMore: true,
      videos: [video("a", 100, 2)],
    };
    await render(snapshot);
    expect(container.textContent).toContain("Not enough videos to compare");
  });
});
