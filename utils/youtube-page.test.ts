import { beforeEach, describe, expect, it } from "vitest";
import {
  channelPathKind,
  isNewestOrder,
  readChannelId,
  readSnapshot,
} from "./youtube-page.ts";

// 2026-10 時点のチャンネル「動画」タブの構造を、読み取りに関わる要素だけ残したもの。
function card(id: string, metadata: string): string {
  return `
    <ytd-rich-item-renderer><yt-lockup-view-model>
      <a href="/watch?v=${id}&pp=x" class="ytLockupViewModelContentImage"></a>
      <h3 title="動画 ${id}"><a href="/watch?v=${id}&pp=x" class="ytLockupMetadataViewModelTitle"><span>動画 ${id}</span></a></h3>
      <div role="group">${metadata}</div>
    </yt-lockup-view-model></ytd-rich-item-renderer>`;
}

function text(value: string, ariaLabel?: string): string {
  const label = ariaLabel ? ` aria-label="${ariaLabel}"` : "";
  return `<span class="ytContentMetadataViewModelMetadataText"${label}>${value}</span>`;
}

function chips(selectedIndex: number): string {
  return ["新しい順", "人気の動画", "古い順"]
    .map(
      (label, index) =>
        `<chip-shape><button role="tab" aria-selected="${index === selectedIndex}">${label}</button></chip-shape>`,
    )
    .join("");
}

function page(body: string): void {
  document.body.innerHTML = `
    <ytd-browse hidden>${card("stale", text("1万", "1万回視聴") + text("1 日前"))}</ytd-browse>
    <ytd-browse><ytd-rich-grid-renderer>${body}</ytd-rich-grid-renderer></ytd-browse>`;
}

const VIDEOS_PATH = "/@YouTube/videos";

beforeEach(() => {
  document.title = "YouTube - YouTube";
});

describe("channelPathKind", () => {
  it.each([
    ["/@YouTube/videos", "list"],
    ["/@YouTube/streams", "list"],
    ["/channel/UC123/videos/", "list"],
    ["/c/GoogleJapan/videos", "list"],
    ["/user/GoogleJapan/streams", "list"],
    ["/GoogleJapan/videos", "list"],
    ["/GoogleJapan/streams/", "list"],
    ["/@YouTube", "root"],
    ["/channel/UC123/", "root"],
    ["/@YouTube/shorts", null],
    ["/@YouTube/featured", null],
    ["/GoogleJapan/featured", null],
    ["/GoogleJapan", null],
    ["/hashtag/videos", null],
    ["/feed/subscriptions", null],
    ["/watch", null],
  ])("%s", (path, expected) => {
    expect(channelPathKind(path)).toBe(expected);
  });
});

describe("readChannelId", () => {
  it("RSS フィードのリンクからチャンネル ID を読む", () => {
    document.head.innerHTML =
      '<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UC123">';
    expect(readChannelId(document, "/@GoogleJapan/featured")).toBe("UC123");
    expect(readChannelId(document, "/watch")).toBeNull();
    document.head.innerHTML = "";
    expect(readChannelId(document, "/@GoogleJapan/videos")).toBeNull();
  });
});

describe("isNewestOrder", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ordered = [1, 3, 3, 9].map((days) => ({ ageMs: days * DAY }));
  const shuffled = [9, 1, 30, 3].map((days) => ({ ageMs: days * DAY }));

  it("並び順のチップで選ばれた文言で判断する", () => {
    page(chips(0));
    expect(isNewestOrder(document, shuffled)).toBe(true);
    page(chips(1));
    expect(isNewestOrder(document, ordered)).toBe(false);
  });

  it("並び順のプルダウンの文言で判断する（メンバーシップのあるチャンネル）", () => {
    const pulldown = (label: string) =>
      `<chip-shape><button role="combobox" aria-selected="false">${label}</button></chip-shape>` +
      '<chip-shape><button role="tab" aria-label="メンバー限定" aria-selected="false">メンバー限定</button></chip-shape>';
    page(pulldown("新しい順"));
    expect(isNewestOrder(document, shuffled)).toBe(true);
    page(pulldown("人気の動画"));
    expect(isNewestOrder(document, ordered)).toBe(false);
  });

  it("文言で判断できなければ、経過時間が上から順に増えているかで判断する", () => {
    page("");
    expect(isNewestOrder(document, ordered)).toBe(true);
    expect(isNewestOrder(document, shuffled)).toBe(false);
    page(
      '<chip-shape><button role="combobox" aria-selected="false">Más recientes</button></chip-shape>',
    );
    expect(isNewestOrder(document, ordered)).toBe(true);
  });
});

describe("readSnapshot", () => {
  it("表示中の一覧から再生数と経過時間を読む", () => {
    page(
      chips(0) +
        card(
          "a1",
          text("YouTube") +
            text("、LDShadowLady") +
            text("55万", "55万回視聴") +
            text("16 時間前"),
        ) +
        card("b2", text("1716万", "1716万回視聴") + text("3 か月前")) +
        card("a1", text("55万", "55万回視聴") + text("16 時間前")),
    );
    expect(readSnapshot(document, VIDEOS_PATH)).toEqual({
      kind: "ready",
      channel: "YouTube",
      videos: [
        {
          id: "a1",
          title: "動画 a1",
          views: 550000,
          ageMs: 16 * 60 * 60 * 1000,
          ageText: "16 時間前",
        },
        {
          id: "b2",
          title: "動画 b2",
          views: 17160000,
          ageMs: 3 * 30.4375 * 24 * 60 * 60 * 1000,
          ageText: "3 か月前",
        },
      ],
      canLoadMore: false,
      empty: false,
    });
  });

  it("一覧の末尾に継続要素があれば、続きを読み込める", () => {
    page(
      card("a1", text("55万", "55万回視聴") + text("1 日前")) +
        "<ytd-continuation-item-renderer></ytd-continuation-item-renderer>",
    );
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({
      canLoadMore: true,
      empty: false,
    });
  });

  it("再生数は位置ではなく再生数の文言から読む", () => {
    page(
      card(
        "m1",
        text("55万", "55万回視聴") + text("メンバー限定") + text("1 日前"),
      ) + card("c1", text("YouTube") + text("1.2万") + text("2 日前")),
    );
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({
      videos: [
        { id: "m1", views: 550000 },
        { id: "c1", views: 12000 },
      ],
    });
  });

  it("再生数を読めない動画は除く", () => {
    page(card("x1", text("YouTube") + text("メンバー限定") + text("1 日前")));
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({ videos: [] });
  });

  it("非表示のカードは読まない", () => {
    page(
      card("a1", text("55万", "55万回視聴") + text("1 日前")).replace(
        "<ytd-rich-item-renderer>",
        "<ytd-rich-item-renderer hidden>",
      ),
    );
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({ videos: [] });
  });

  it("動画のないチャンネルの案内を見分ける", () => {
    page(
      "<ytd-message-renderer>このチャンネルには動画がありません</ytd-message-renderer>",
    );
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({
      videos: [],
      empty: true,
    });
    page("");
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({ empty: false });
  });

  it("経過時間のない動画（配信中・公開予定）は除く", () => {
    page(card("live", text("1234 人が視聴中")));
    expect(readSnapshot(document, VIDEOS_PATH)).toMatchObject({ videos: [] });
  });

  it("新しい順でなければ一覧を読まない", () => {
    page(chips(1) + card("a1", text("55万", "55万回視聴") + text("1 日前")));
    expect(readSnapshot(document, VIDEOS_PATH)).toEqual({
      kind: "not-newest",
      channel: "YouTube",
    });
  });

  it("ホームタブのないチャンネルは、トップの URL でも動画一覧を読む", () => {
    page(card("a1", text("55万", "55万回視聴") + text("1 日前")));
    expect(readSnapshot(document, "/@YouTube")).toMatchObject({
      kind: "ready",
      videos: [{ id: "a1" }],
    });
  });

  it("トップの URL がホームタブなら対象外", () => {
    document.body.innerHTML =
      "<ytd-browse><ytd-section-list-renderer><ytd-shelf-renderer></ytd-shelf-renderer></ytd-section-list-renderer></ytd-browse>";
    expect(readSnapshot(document, "/@YouTube")).toEqual({
      kind: "unsupported",
    });
  });

  it("チャンネルの動画一覧以外は対象外", () => {
    expect(readSnapshot(document, "/watch")).toEqual({ kind: "unsupported" });
  });
});
