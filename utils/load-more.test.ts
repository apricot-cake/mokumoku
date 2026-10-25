import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMore, loadUntil, oldestLoadedAgeMs } from "./load-more.ts";

const GRID = "ytd-browse ytd-rich-grid-renderer";

function grid(cards: number, continuation: boolean): void {
  document.body.innerHTML = `<ytd-browse><ytd-rich-grid-renderer><div id="contents">${"<ytd-rich-item-renderer></ytd-rich-item-renderer>".repeat(cards)}${continuation ? "<ytd-continuation-item-renderer></ytd-continuation-item-renderer>" : ""}</div></ytd-rich-grid-renderer></ytd-browse>`;
}

function contents(): Element {
  return document.querySelector(`${GRID} #contents`) as Element;
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("loadMore", () => {
  it("継続要素がなければ end", async () => {
    grid(3, false);
    expect(await loadMore(document)).toBe("end");
  });

  it("動画が増えたら loaded を返し、スクロール位置を戻す", async () => {
    grid(3, true);
    const continuation = document.querySelector(
      "ytd-continuation-item-renderer",
    );
    const result = loadMore(document);
    expect(continuation?.scrollIntoView).toHaveBeenCalled();
    contents().insertAdjacentHTML(
      "afterbegin",
      "<ytd-rich-item-renderer></ytd-rich-item-renderer>",
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toBe("loaded");
    expect(window.scrollTo).toHaveBeenCalledWith(0, window.scrollY);
  });

  it("継続要素が消えたら end", async () => {
    grid(3, true);
    const result = loadMore(document);
    document.querySelector("ytd-continuation-item-renderer")?.remove();
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toBe("end");
  });

  it("時間内に増えなければ timeout", async () => {
    grid(3, true);
    const result = loadMore(document, 1000);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await result).toBe("timeout");
  });

  it("ページ移動で待機を中止し、移動先に古いスクロール位置を適用しない", async () => {
    grid(3, true);
    const controller = new AbortController();
    const result = loadMore(document, 10000, controller.signal);
    controller.abort();
    expect(await result).toBe("cancelled");
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("中止済みなら継続要素へスクロールしない", async () => {
    grid(3, true);
    const controller = new AbortController();
    controller.abort();
    expect(await loadMore(document, 10000, controller.signal)).toBe(
      "cancelled",
    );
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

const DAY = 24 * 60 * 60 * 1000;

function video(id: string, days: number): string {
  return `<ytd-rich-item-renderer><a class="ytLockupMetadataViewModelTitle" href="/watch?v=${id}">${id}</a><span class="ytContentMetadataViewModelMetadataText" aria-label="1万回視聴">1万</span><span class="ytContentMetadataViewModelMetadataText">${days} 日前</span></ytd-rich-item-renderer>`;
}

// 継続要素が画面に入るたびに、次の1回分（より古い動画）を一覧に足す。
function channel(batches: number[][]): void {
  const [first = [], ...rest] = batches;
  document.body.innerHTML = `<ytd-browse><ytd-rich-grid-renderer><div id="contents">${first.map((days, i) => video(`a${i}`, days)).join("")}<ytd-continuation-item-renderer></ytd-continuation-item-renderer></div></ytd-rich-grid-renderer></ytd-browse>`;
  let batch = 0;
  Element.prototype.scrollIntoView = vi.fn(() => {
    const next = rest[batch];
    const continuation = document.querySelector(
      "ytd-continuation-item-renderer",
    );
    if (!next) return;
    batch += 1;
    continuation?.insertAdjacentHTML(
      "beforebegin",
      next.map((days, i) => video(`b${batch}-${i}`, days)).join(""),
    );
    if (batch === rest.length) continuation?.remove();
  });
}

async function run<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5000);
  return promise;
}

describe("oldestLoadedAgeMs", () => {
  it("読み込み済みで一番古い動画の経過時間", () => {
    channel([[1, 3, 9]]);
    expect(oldestLoadedAgeMs(document)).toBe(9 * DAY);
  });
});

describe("loadUntil", () => {
  it("期間を超える動画が現れたら reached で止まる", async () => {
    channel([
      [1, 2],
      [3, 5],
      [8, 13],
      [20, 30],
    ]);
    const result = await run(
      loadUntil(document, 7 * DAY, new AbortController().signal),
    );
    expect(result).toBe("reached");
    expect(oldestLoadedAgeMs(document)).toBe(13 * DAY);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("すでに期間を超えていれば読み込まない", async () => {
    channel([[1, 10], [20]]);
    expect(
      await run(loadUntil(document, 7 * DAY, new AbortController().signal)),
    ).toBe("reached");
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("一覧の最後まで読み込んだら end", async () => {
    channel([[1], [2], [3]]);
    expect(
      await run(loadUntil(document, 30 * DAY, new AbortController().signal)),
    ).toBe("end");
  });

  it("上限の本数を読み込んだら limit", async () => {
    channel([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(
      await run(loadUntil(document, 30 * DAY, new AbortController().signal, 4)),
    ).toBe("limit");
    expect(document.querySelectorAll("ytd-rich-item-renderer")).toHaveLength(6);
  });

  it("中止されたら cancelled", async () => {
    channel([[1], [2], [3]]);
    const controller = new AbortController();
    controller.abort();
    expect(await run(loadUntil(document, 30 * DAY, controller.signal))).toBe(
      "cancelled",
    );
  });

  it("追加読み込みの途中で中止したら、次の読み込みを始めない", async () => {
    channel([[1], [2], [3]]);
    const controller = new AbortController();
    const result = loadUntil(document, 30 * DAY, controller.signal);
    controller.abort();
    expect(await result).toBe("cancelled");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
