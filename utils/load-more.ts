import type { LoadMoreResult } from "./snapshot.ts";
import { CARD, CONTINUATION } from "./youtube-page.ts";

const POLL_MS = 200;
export const LOAD_MORE_TIMEOUT_MS = 10000;

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
