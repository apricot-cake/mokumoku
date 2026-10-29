import type { Page } from "puppeteer-core";

/** 実サイト確認の通信量を制限する。アクセス制限を回避する操作はしない。 */
export function liveNetwork() {
  const state = {
    documents: 0,
    browseRequests: 0,
    blockedAssets: 0,
    failure: "",
    responses: [] as { status: number; path: string; retryAfter?: string }[],
  };
  let lastBrowse = 0;
  let queue = Promise.resolve();
  let closing = false;
  return {
    state,
    finish() {
      closing = true;
    },
    stop(reason: string) {
      state.failure ||= reason;
    },
    async attach(page: Page) {
      await page.setRequestInterception(true);
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.hostname !== "www.youtube.com") return;
        if ([403, 429, 503].includes(response.status())) {
          state.responses.push({
            status: response.status(),
            path: url.pathname,
            retryAfter: response.headers()["retry-after"],
          });
          state.failure ||= `YouTubeがHTTP ${response.status()}を返しました。再試行せず停止します。`;
        }
      });
      page.on("request", (request) => {
        void (async () => {
          const url = new URL(request.url());
          if (state.failure) return await request.abort();
          // 検証対象はメタデータとパネル操作。画像・フォント・動画再生は取得しない。
          if (
            ["image", "font", "media"].includes(request.resourceType()) ||
            url.hostname.endsWith(".googlevideo.com") ||
            /\/youtubei\/v1\/(player|log_event)$/.test(url.pathname)
          ) {
            state.blockedAssets += 1;
            return await request.abort();
          }
          const document =
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame();
          const browse =
            url.hostname === "www.youtube.com" &&
            url.pathname === "/youtubei/v1/browse";
          if (browse && request.postData()?.includes('"continuation"')) {
            state.failure =
              "追加の動画取得を要求したため停止しました。自動追加読み込みは固定E2Eで確認してください。";
            return await request.abort();
          }
          if (document) state.documents += 1;
          if (browse) state.browseRequests += 1;
          if (state.documents > 3 || state.browseRequests > 8) {
            state.failure =
              "実サイトの通信回数が上限（ページ3回・一覧API8回）を超えたため停止しました。";
            return await request.abort();
          }
          if (browse || document) {
            queue = queue.then(async () => {
              const delay = Math.max(0, 2000 - (Date.now() - lastBrowse));
              if (delay)
                await new Promise((resolve) => setTimeout(resolve, delay));
              lastBrowse = Date.now();
            });
            await queue;
          }
          if (state.failure) await request.abort();
          else await request.continue();
        })().catch((error: unknown) => {
          if (!closing && !page.isClosed())
            state.failure ||= `通信制御に失敗しました: ${String(error)}`;
        });
      });
    },
  };
}
