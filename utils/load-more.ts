import type { LoadMoreResult } from "./snapshot.ts";
import { CARD, CONTINUATION, readVideo } from "./youtube-page.ts";

const POLL_MS = 200;
export const LOAD_MORE_TIMEOUT_MS = 10000;
/** 期間まで続けて読み込むとき、1回の操作で増やす動画数の上限。 */
export const LOAD_UNTIL_MAX_VIDEOS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 一覧の末尾の継続要素を画面に入れ、YouTube 自身に次の動画を読み込ませる。
 * 手でスクロールしたときと同じ読み込みで、DOM には手を加えない。
 * 読み込みを確認したら、読んでいた位置が飛ばないようスクロールを戻す。
 */
export async function loadMore(
  doc: Document,
  timeoutMs = LOAD_MORE_TIMEOUT_MS,
): Promise<LoadMoreResult> {
  const continuation = doc.querySelector(CONTINUATION);
  if (continuation === null) return "end";
  const view = doc.defaultView;
  const scrollY = view?.scrollY ?? 0;
  const before = doc.querySelectorAll(CARD).length;
  continuation.scrollIntoView({ block: "end" });
  const deadline = Date.now() + timeoutMs;
  let result: LoadMoreResult = "timeout";
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    if (doc.querySelectorAll(CARD).length > before) {
      result = "loaded";
      break;
    }
    if (doc.querySelector(CONTINUATION) === null) {
      result = "end";
      break;
    }
  }
  view?.scrollTo(0, scrollY);
  return result;
}

/** 読み込み済みで一番古い動画の経過時間。読めた動画がなければ NaN。 */
export function oldestLoadedAgeMs(doc: Document): number {
  let oldest = Number.NaN;
  for (const card of doc.querySelectorAll(CARD)) {
    const ageMs = readVideo(card)?.ageMs;
    if (ageMs !== undefined && !(ageMs <= oldest)) oldest = ageMs;
  }
  return oldest;
}

/**
 * 一番古い動画が `maxAgeMs` を超えるまで、1回分ずつ続けて読み込む。並び順は
 * 新しい順なので、そこで止めれば期間内の動画はすべて読み込めている。
 * 各回は YouTube の読み込み完了を待ってから次に進む。
 */
export async function loadUntil(
  doc: Document,
  maxAgeMs: number,
  signal: AbortSignal,
  maxVideos = LOAD_UNTIL_MAX_VIDEOS,
  timeoutMs = LOAD_MORE_TIMEOUT_MS,
): Promise<LoadMoreResult> {
  const start = doc.querySelectorAll(CARD).length;
  while (true) {
    if (signal.aborted) return "cancelled";
    if (oldestLoadedAgeMs(doc) > maxAgeMs) return "reached";
    if (doc.querySelectorAll(CARD).length - start >= maxVideos) return "limit";
    const result = await loadMore(doc, timeoutMs);
    if (result !== "loaded") return result;
  }
}
