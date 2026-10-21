import { parseAge } from "./age.ts";
import { normalizeDigits, parseCount } from "./count.ts";
import type { PageSnapshot, VideoEntry } from "./snapshot.ts";

// SPA の遷移後も前のページの ytd-browse が hidden で残るので、表示中のものに限る。
const BROWSE = "ytd-browse:not([hidden])";
const GRID = `${BROWSE} ytd-rich-grid-renderer`;
// 一覧には非表示のカードが残ることがあるので、表示中のものに限る。
export const CARD = `${GRID} ytd-rich-item-renderer:not([hidden])`;
// 「このチャンネルには動画がありません」などの案内。文言は表示言語で変わる
// ので、要素の有無で見る。
const EMPTY_MESSAGE = `${BROWSE} ytd-message-renderer`;
// 一覧の末尾に置かれ、画面に入ると次の動画を読み込む要素。最後まで読み込むと消える。
export const CONTINUATION = `${GRID} ytd-continuation-item-renderer`;
const TITLE_LINK =
  "a.ytLockupMetadataViewModelTitle, a#video-title-link, a#video-title";
const METADATA_TEXT =
  ".ytContentMetadataViewModelMetadataText, #metadata-line span, .inline-metadata-item";
// 並び順の欄。チップを並べる形では選ばれたタブ、メンバーシップのある
// チャンネルなどでは現在の並び順を表示するプルダウン（combobox）になる。
const SORT_CONTROL = [
  `${GRID} [role="combobox"]`,
  `${GRID} [role="tab"][aria-selected="true"]`,
  `${GRID} yt-chip-cloud-chip-renderer[selected]`,
].join(", ");
const NEWEST_LABEL = /^(?:新しい順|Latest|Newest)$/i;
const OTHER_ORDER_LABEL =
  /^(?:人気の動画|人気順|再生回数順|古い順|Popular|Most popular|Oldest)$/i;
// 再生数の項目の文言。表示言語ごとの綴りは Sift の YouTube 対応で確かめたもの。
const VIEW_LABEL =
  /(?:views?|回視聴|回再生|조회수|次觀看|次观看|visualizaciones?|visualiza(?:ç|c)[õo]es?)/i;
// 「回視聴」を省いた数値だけの再生数の表示。
const COMPACT_COUNT = /^[\d.,\s]+(?:[KMB]|[千천万萬만億亿억])?$/i;

const CHANNEL_PATH =
  /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(\/(?:videos|streams))?\/?$/;

/**
 * チャンネルの動画一覧になりうるパスか。「動画」「ライブ」タブのほか、
 * 「ホーム」タブのないチャンネルではトップの URL に「動画」タブが表示される。
 * トップが「ホーム」かどうかはパスでは決まらないので、"root" として返す。
 */
export function channelPathKind(pathname: string): "list" | "root" | null {
  const match = CHANNEL_PATH.exec(pathname);
  if (!match) return null;
  return match[1] ? "list" : "root";
}

/**
 * 並び順が「新しい順」か。並び順の欄の文言で判断し、判断できないとき
 * （欄のない小さなチャンネルや、文言を知らない表示言語）は、読み取った
 * 動画の経過時間が上から順に増えているかで判断する。新しい順なら必ず
 * そうなり、人気順や古い順ではまず崩れる。
 */
export function isNewestOrder(
  root: ParentNode,
  videos: readonly Pick<VideoEntry, "ageMs">[],
): boolean {
  for (const control of root.querySelectorAll(SORT_CONTROL)) {
    const label = (
      control.getAttribute("aria-label") ||
      control.textContent ||
      ""
    ).trim();
    if (NEWEST_LABEL.test(label)) return true;
    if (OTHER_ORDER_LABEL.test(label)) return false;
  }
  return videos.every(
    (video, index) =>
      index === 0 || video.ageMs >= (videos[index - 1]?.ageMs ?? 0),
  );
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

  // 経過時間として読める最後の項目を探す。配信中や公開予定の動画には
  // 経過時間がないので、ここで除外される。
  const texts = [...card.querySelectorAll(METADATA_TEXT)].map((element) => ({
    text: (element.textContent ?? "").trim(),
    label: (
      element.getAttribute("aria-label") ||
      element.textContent ||
      ""
    ).trim(),
  }));
  const ageIndex = texts.findLastIndex(({ text }) =>
    Number.isFinite(parseAge(text)),
  );
  const age = texts[ageIndex];
  if (!age) return null;
  // 再生数は、位置ではなく再生数の文言を含む項目から読む。文言のない
  // 数値だけの表示は、経過時間の直前にある場合に限って再生数とみなす。
  const before = texts.slice(0, ageIndex);
  const viewText =
    before.find(({ label }) => VIEW_LABEL.test(label))?.label ??
    [before.at(-1)?.text ?? ""].find((text) =>
      COMPACT_COUNT.test(normalizeDigits(text)),
    );
  if (viewText === undefined) return null;
  return {
    id,
    title: readTitle(link),
    views: parseCount(viewText),
    ageMs: parseAge(age.text),
    ageText: age.text,
  };
}

export function readChannelName(doc: Document): string {
  return doc.title.replace(/\s+-\s+YouTube$/, "").trim();
}

export function readSnapshot(doc: Document, pathname: string): PageSnapshot {
  const pathKind = channelPathKind(pathname);
  // 「ホーム」タブは動画一覧のグリッドではなく棚を並べるので、グリッドの有無で見分ける。
  if (
    pathKind === null ||
    (pathKind === "root" && doc.querySelector(GRID) === null)
  )
    return { kind: "unsupported" };
  const channel = readChannelName(doc);
  const seen = new Set<string>();
  const videos: VideoEntry[] = [];
  for (const card of doc.querySelectorAll(CARD)) {
    const video = readVideo(card);
    if (video && !seen.has(video.id)) {
      seen.add(video.id);
      videos.push(video);
    }
  }
  if (!isNewestOrder(doc, videos)) return { kind: "not-newest", channel };
  return {
    kind: "ready",
    channel,
    videos,
    canLoadMore: doc.querySelector(CONTINUATION) !== null,
    empty:
      videos.length === 0 &&
      doc.querySelector(CARD) === null &&
      doc.querySelector(EMPTY_MESSAGE) !== null,
  };
}
