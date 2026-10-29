import type { Page } from "puppeteer-core";

export const FIXTURE_URL = "https://www.youtube.com/@fixture/videos";
export const CARD = "ytd-rich-item-renderer";
const ages = [0.25, 1, 2, 3, 4, 5, 6, 7, 8, 15, 30, 45, 90, 200, 400];
const videos = ages.map((days, index) => ({
  id: `fixture-${index}`,
  title: index === 4 ? "注目動画" : `サンプル動画 ${index}`,
  views: index === 4 ? 500000 : Math.round(days * 1000),
  age: days < 1 ? "6時間前" : `${days}日前`,
}));

// この関数は固定 HTML 内で動く。拡張機能 API や実装内部の関数は呼ばない。
function fixturePage() {
  const grid = () => document.querySelector("ytd-rich-grid-renderer");
  let generation = 0;
  let pending = false;
  let offset = 0;
  const observer = new IntersectionObserver(async (entries) => {
    if (pending || !entries.some((entry) => entry.isIntersecting)) return;
    pending = true;
    const current = generation;
    const response = await fetch(`/e2e/batch?offset=${offset}`);
    const batch = await response.json();
    if (current !== generation) return;
    add(batch.videos);
    offset += batch.videos.length;
    pending = false;
    if (batch.end)
      document.querySelector("ytd-continuation-item-renderer")?.remove();
  });
  function add(
    items: { id: string; title: string; views: number; age: string }[],
  ) {
    const continuation = document.querySelector(
      "ytd-continuation-item-renderer",
    );
    for (const item of items) {
      const card = document.createElement("ytd-rich-item-renderer");
      const link = document.createElement("a");
      link.id = "video-title";
      link.href = `/watch?v=${item.id}`;
      link.textContent = item.title;
      const metadata = document.createElement("div");
      metadata.id = "metadata-line";
      for (const text of [`${item.views}回視聴`, item.age]) {
        const span = document.createElement("span");
        span.textContent = text;
        metadata.append(span);
      }
      card.append(link, metadata);
      grid()?.insertBefore(card, continuation);
    }
  }
  function render() {
    observer.disconnect();
    pending = false;
    offset = 0;
    document
      .querySelector("yt-page-navigation-progress")
      ?.setAttribute("hidden", "");
    const browse = document.querySelector("ytd-browse");
    if (!browse) return;
    browse.innerHTML =
      '<ytd-rich-grid-renderer><button role="tab" aria-selected="true">新しい順</button></ytd-rich-grid-renderer>';
    // 初回応答は HTML の JSON から読む。追加応答は実際のスクロールを契機に返す。
    add(
      JSON.parse(
        document.querySelector("#initial-videos")?.textContent ?? "[]",
      ),
    );
    offset = 9;
    const continuation = document.createElement(
      "ytd-continuation-item-renderer",
    );
    continuation.textContent = "続き";
    grid()?.append(continuation);
    observer.observe(continuation);
    document.dispatchEvent(new Event("yt-navigate-finish"));
  }
  document.querySelectorAll<HTMLAnchorElement>("nav a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      generation += 1;
      observer.disconnect();
      document.dispatchEvent(new Event("yt-navigate-start"));
      history.pushState(null, "", link.href);
      document.querySelector("ytd-browse")?.replaceChildren();
      document
        .querySelector("yt-page-navigation-progress")
        ?.removeAttribute("hidden");
      document
        .querySelector<HTMLButtonElement>("#finish-navigation")
        ?.removeAttribute("hidden");
      window.scrollTo(0, 0);
    });
  });
  document
    .querySelector("#finish-navigation")
    ?.addEventListener("click", (event) => {
      (event.currentTarget as HTMLElement).setAttribute("hidden", "");
      render();
    });
  render();
}

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>E2E チャンネル - YouTube</title>
<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=fixture-channel">
<style>ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-continuation-item-renderer{display:block}ytd-rich-item-renderer{height:180px}nav{height:60px}span{margin-right:12px}</style>
</head><body><nav><a href="/@fixture/videos" id="videos">動画</a> <a href="/@fixture/streams" id="streams">ライブ</a></nav>
<button id="finish-navigation" hidden>移動先の読み込み完了</button><yt-page-navigation-progress hidden></yt-page-navigation-progress><ytd-browse></ytd-browse>
<script id="initial-videos" type="application/json">${JSON.stringify(videos.slice(0, 9))}</script>
<script>(${fixturePage.toString()})();</script></body></html>`;

/** YouTube への外部通信を固定応答に置き換える。実サイトの DOM 確認とは区別する。 */
export async function serveFixture(page: Page) {
  const requests: number[] = [];
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      const url = new URL(request.url());
      if (
        url.origin === "https://www.youtube.com" &&
        url.pathname === "/e2e/batch"
      ) {
        const offset = Number(url.searchParams.get("offset"));
        requests.push(offset);
        if (gate) await gate;
        const batch = videos.slice(offset, offset + 3);
        await request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            videos: batch,
            end: offset + batch.length >= videos.length,
          }),
        });
      } else if (request.isNavigationRequest()) {
        await request.respond({
          status: 200,
          contentType: "text/html",
          body: html,
        });
      } else {
        await request.abort();
      }
    })().catch(() => {
      // 中止・ページ破棄に伴う応答済みリクエストは終了済みとして扱う。
    });
  });
  return {
    requests,
    hold() {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release() {
      release?.();
      gate = undefined;
    },
  };
}
