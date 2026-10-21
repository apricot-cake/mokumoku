import { useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { t } from "../../utils/i18n.ts";
import { type RankedVideo, rankVideos } from "../../utils/ranking.ts";
import { MIN_BASELINE_SAMPLES } from "../../utils/score.ts";
import {
  isLoadMoreResult,
  LOAD_MORE_REQUEST,
  type PageSnapshot,
} from "../../utils/snapshot.ts";
import { usePageSnapshot } from "./use-page-snapshot.ts";

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const ratioNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function Notice({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      {hint ? <p className="text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function VideoRow({ video, rank }: { video: RankedVideo; rank?: number }) {
  return (
    <li>
      <a
        href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
        target="_blank"
        rel="noreferrer"
        className="flex gap-3 rounded-md p-2 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        <span className="w-5 shrink-0 pt-1 text-right text-xs text-muted-foreground tabular-nums">
          {rank ?? "–"}
        </span>
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="aspect-video w-28 shrink-0 rounded object-cover"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="line-clamp-2 text-sm leading-snug text-foreground">
            {video.title}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span
              className="font-semibold text-primary tabular-nums"
              title={t("panelRatioDescription")}
            >
              ×{ratioNumber.format(video.ratio)}
            </span>
            <span>{t("panelViews", [compactNumber.format(video.views)])}</span>
            <span>{video.ageText}</span>
          </p>
        </div>
      </a>
    </li>
  );
}

function LoadMoreButton({
  tabId,
  canLoadMore,
}: {
  tabId: number;
  canLoadMore: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  async function load(): Promise<void> {
    setState("loading");
    const result = await browser.tabs
      .sendMessage(tabId, { type: LOAD_MORE_REQUEST })
      .catch(() => null);
    // 増えた動画は content script の更新通知で一覧に届く。
    setState(
      isLoadMoreResult(result) && result !== "timeout" ? "idle" : "failed",
    );
  }

  if (!canLoadMore) {
    return (
      <p className="text-xs text-muted-foreground">{t("panelAllLoaded")}</p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void load()}
        disabled={state === "loading"}
        className="h-8 shrink-0 rounded-md border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {state === "loading" ? t("panelLoadingMore") : t("panelLoadMore")}
      </button>
      {state === "failed" ? (
        <p role="alert" className="text-xs text-destructive">
          {t("panelLoadMoreFailed")}
        </p>
      ) : null}
    </div>
  );
}

function ChannelRanking({
  tabId,
  snapshot,
}: {
  tabId: number;
  snapshot: Extract<PageSnapshot, { kind: "ready" }>;
}) {
  const ranking = useMemo(() => rankVideos(snapshot.videos), [snapshot]);
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="truncate text-base font-semibold text-foreground">
            {snapshot.channel}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("panelLoadedCount", [String(snapshot.videos.length)])}
          </p>
        </div>
        <LoadMoreButton tabId={tabId} canLoadMore={snapshot.canLoadMore} />
      </header>
      {snapshot.videos.length === 0 ? (
        <Notice title={t("panelEmpty")} />
      ) : ranking.kind === "insufficient" ? (
        <Notice
          title={t("panelInsufficient", [String(MIN_BASELINE_SAMPLES)])}
        />
      ) : (
        <>
          <ol className="flex flex-col p-2">
            {ranking.videos.map((video, index) => (
              <VideoRow key={video.id} video={video} rank={index + 1} />
            ))}
          </ol>
          {ranking.fresh.length > 0 ? (
            <section className="flex flex-col border-t">
              <h2 className="px-4 pt-3 text-xs font-medium text-muted-foreground">
                {t("panelProvisional")}
              </h2>
              <ul className="flex flex-col p-2">
                {ranking.fresh.map((video) => (
                  <VideoRow key={video.id} video={video} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export function SidepanelApp() {
  const page = usePageSnapshot();
  if (page === undefined) return null;
  if (page === null || page.snapshot.kind === "unsupported") {
    return (
      <Notice
        title={t("panelOpenChannel")}
        hint={page === null ? t("panelReloadHint") : undefined}
      />
    );
  }
  const { snapshot } = page;
  if (snapshot.kind === "not-newest") {
    return (
      <Notice
        title={t("panelSwitchToNewest")}
        hint={t("panelSwitchToNewestHint")}
      />
    );
  }
  // タブの切り替えで読み込み中の表示を持ち越さないよう、タブごとに作り直す。
  return (
    <ChannelRanking key={page.tabId} tabId={page.tabId} snapshot={snapshot} />
  );
}
