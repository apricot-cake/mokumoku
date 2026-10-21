import { parseAge } from "./age.ts";
import { parseCount } from "./count.ts";
import type { PageSnapshot, VideoEntry } from "./snapshot.ts";

// SPA の遷移後も前のページの ytd-browse が hidden で残るので、表示中のものに限る。
const BROWSE = "ytd-browse:not([hidden])";
const GRID = `${BROWSE} ytd-rich-grid-renderer`;
export const CARD = `${GRID} ytd-rich-item-renderer`;
// 一覧の末尾に置かれ、画面に入ると次の動画を読み込む要素。最後まで読み込むと消える。
export const CONTINUATION = `${GRID} ytd-continuation-item-renderer`;
const TITLE_LINK =
  "a.ytLockupMetadataViewModelTitle, a#video-title-link, a#video-title";
const METADATA_TEXT =
  ".ytContentMetadataViewModelMetadataText, #metadata-line span, .inline-metadata-item";
const SORT_TAB = `${BROWSE} chip-shape button[role="tab"], ${BROWSE} yt-chip-cloud-chip-renderer`;

const CHANNEL_VIDEOS_PATH =
  /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/(?:videos|streams)\/?$/;

export function isChannelVideosPath(pathname: string): boolean {
  return CHANNEL_VIDEOS_PATH.test(pathname);
}

/**
 * 並び順が「新しい順」か。チップの文言は表示言語で変わるが、並びは
 * 新しい順・人気の動画・古い順で固定なので、先頭が選ばれているかで判定する。
 * 動画の少ないチャンネルにはチップ自体がなく、常に新しい順で並ぶ。
 */
export function isNewestOrder(root: ParentNode): boolean {
  const tabs = [...root.querySelectorAll(SORT_TAB)];
  if (tabs.length === 0) return true;
  const selected = tabs.findIndex(
    (tab) =>
      tab.getAttribute("aria-selected") === "true" ||
      tab.hasAttribute("selected"),
  );
  return selected === 0;
}

function readVideoId(href: string | null): string | null {
  if (!href) return null;
  const url = new URL(href, "https://www.youtube.com");
  return url.pathname === "/watch" ? url.searchParams.get("v") : null;
}

function readTitle(link: Element): string {
  return (
    link.closest("h3")?.getAttribute("title") ??
    link.getAttribute("title") ??
    link.textContent ??
    ""
  ).trim();
}

export function readVideo(card: Element): VideoEntry | null {
  const link = card.querySelector(TITLE_LINK);
  const id = readVideoId(link?.getAttribute("href") ?? null);
  if (!link || !id) return null;

  // メタデータは「チャンネル名…、再生数、経過時間」の順に並ぶ。経過時間として
  // 読める最後の要素を探し、その直前を再生数として読む。配信中や公開予定の
  // 動画には経過時間がないので、ここで除外される。
  const texts = [...card.querySelectorAll(METADATA_TEXT)];
  for (let index = texts.length - 1; index > 0; index -= 1) {
    const ageText = (texts[index]?.textContent ?? "").trim();
    const ageMs = parseAge(ageText);
    if (!Number.isFinite(ageMs)) continue;
    const viewsElement = texts[index - 1] as Element;
    const views = parseCount(
      viewsElement.getAttribute("aria-label") ?? viewsElement.textContent ?? "",
    );
    return { id, title: readTitle(link), views, ageMs, ageText };
  }
  return null;
}

export function readChannelName(doc: Document): string {
  return doc.title.replace(/\s+-\s+YouTube$/, "").trim();
}

export function readSnapshot(doc: Document, pathname: string): PageSnapshot {
  if (!isChannelVideosPath(pathname)) return { kind: "unsupported" };
  const channel = readChannelName(doc);
  if (!isNewestOrder(doc)) return { kind: "not-newest", channel };
  const seen = new Set<string>();
  const videos: VideoEntry[] = [];
  for (const card of doc.querySelectorAll(CARD)) {
    const video = readVideo(card);
    if (video && !seen.has(video.id)) {
      seen.add(video.id);
      videos.push(video);
    }
  }
  return {
    kind: "ready",
    channel,
    videos,
    canLoadMore: doc.querySelector(CONTINUATION) !== null,
  };
}
