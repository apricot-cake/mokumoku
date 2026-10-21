import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMore } from "./load-more.ts";

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
});
