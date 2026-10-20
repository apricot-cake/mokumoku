import { beforeEach, describe, expect, it } from "vitest";
import {
  isChannelVideosPath,
  isNewestOrder,
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

describe("isChannelVideosPath", () => {
  it.each([
    ["/@YouTube/videos", true],
    ["/@YouTube/streams", true],
    ["/channel/UC123/videos/", true],
    ["/@YouTube", false],
    ["/@YouTube/shorts", false],
    ["/watch", false],
  ])("%s", (path, expected) => {
    expect(isChannelVideosPath(path)).toBe(expected);
  });
});

describe("isNewestOrder", () => {
  it("先頭のチップが選ばれていれば新しい順", () => {
    page(chips(0));
    expect(isNewestOrder(document)).toBe(true);
    page(chips(1));
    expect(isNewestOrder(document)).toBe(false);
  });

  it("チップのないチャンネルは新しい順", () => {
    page("");
    expect(isNewestOrder(document)).toBe(true);
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
    });
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

  it("チャンネルの動画一覧以外は対象外", () => {
    expect(readSnapshot(document, "/watch")).toEqual({ kind: "unsupported" });
  });
});
