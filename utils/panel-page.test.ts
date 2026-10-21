import { describe, expect, it } from "vitest";
import { hasLeftPanelPage, isPanelOwner, panelPageKey } from "./panel-page.ts";

describe("panelPageKey", () => {
  it("同じチャンネル内のページは同じキーにする", () => {
    const home = panelPageKey("https://www.youtube.com/@GoogleJapan");
    expect(panelPageKey("https://www.youtube.com/@GoogleJapan/videos")).toBe(
      home,
    );
    expect(
      panelPageKey("https://www.youtube.com/@GoogleJapan/streams?hl=ja"),
    ).toBe(home);
    expect(panelPageKey("https://www.youtube.com/@YouTube/videos")).not.toBe(
      home,
    );
  });

  it("動画ページは動画ごとに別のキーにする", () => {
    expect(panelPageKey("https://www.youtube.com/watch?v=a")).not.toBe(
      panelPageKey("https://www.youtube.com/watch?v=b"),
    );
  });

  it("URL を読めなければ null", () => {
    expect(panelPageKey(undefined)).toBeNull();
    expect(panelPageKey("not a url")).toBeNull();
  });
});

describe("hasLeftPanelPage", () => {
  const owner = {
    tabId: 1,
    windowId: 1,
    pageKey: panelPageKey("https://www.youtube.com/@GoogleJapan/videos"),
  };

  it("同じページの再読み込みやチャンネル内の移動では閉じない", () => {
    expect(
      hasLeftPanelPage(owner, {
        url: "https://www.youtube.com/@GoogleJapan/videos",
        loading: true,
      }),
    ).toBe(false);
    expect(
      hasLeftPanelPage(owner, {
        url: "https://www.youtube.com/@GoogleJapan/streams",
        loading: false,
      }),
    ).toBe(false);
  });

  it("別のページへ移ったら閉じる", () => {
    expect(
      hasLeftPanelPage(owner, {
        url: "https://www.youtube.com/watch?v=a",
        loading: false,
      }),
    ).toBe(true);
  });

  it("URL を読めない読み込みは、YouTube の外への遷移として閉じる", () => {
    expect(hasLeftPanelPage(owner, { loading: true })).toBe(true);
    expect(
      hasLeftPanelPage({ ...owner, pageKey: null }, { loading: true }),
    ).toBe(true);
  });

  it("所有タブの記録を判別する", () => {
    expect(isPanelOwner(owner)).toBe(true);
    expect(isPanelOwner({ tabId: 1 })).toBe(false);
  });
});
