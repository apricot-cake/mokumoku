import { useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { t } from "../../utils/i18n.ts";
import { LOAD_UNTIL_MAX_VIDEOS } from "../../utils/load-more.ts";
import {
  isPeriodId,
  isWithinPeriod,
  PERIODS,
  type PeriodId,
  periodMaxAgeMs,
} from "../../utils/period.ts";
import { type RankedVideo, rankVideos } from "../../utils/ranking.ts";
import { MIN_BASELINE_SAMPLES } from "../../utils/score.ts";
import {
  isLoadMoreResult,
  LOAD_CANCEL_REQUEST,
  LOAD_MORE_REQUEST,
  type LoadMoreRequest,
  type PageSnapshot,
} from "../../utils/snapshot.ts";
import { usePageSnapshot } from "./use-page-snapshot.ts";
import { usePeriod } from "./use-period.ts";

const PERIOD_LABELS: Record<PeriodId, () => string> = {
  all: () => t("panelPeriodAll"),
  week: () => t("panelPeriodWeek"),
  month: () => t("panelPeriodMonth"),
  quarter: () => t("panelPeriodQuarter"),
  halfYear: () => t("panelPeriodHalfYear"),
  year: () => t("panelPeriodYear"),
};

function PeriodSelect({
  value,
  onChange,
}: {
  value: PeriodId;
  onChange: (period: PeriodId) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {t("panelPeriodLabel")}
      <select
        value={value}
        onChange={(event) => {
          if (isPeriodId(event.target.value)) onChange(event.target.value);
        }}
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {PERIODS.map((period) => (
          <option key={period.id} value={period.id}>
            {PERIOD_LABELS[period.id]()}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  untilAgeMs,
  periodLoaded,
}: {
  tabId: number;
  canLoadMore: boolean;
  /** 表示期間の長さ。指定があれば、期間を超える動画まで続けて読み込む。 */
  untilAgeMs: number | null;
  /** 表示期間を超える動画まで、すでに読み込み済みか。 */
  periodLoaded: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "failed" | "limit">(
    "idle",
  );

  async function load(): Promise<void> {
    setState("loading");
    const request: LoadMoreRequest =
      untilAgeMs === null
        ? { type: LOAD_MORE_REQUEST }
        : { type: LOAD_MORE_REQUEST, untilAgeMs };
    const result = await browser.tabs
      .sendMessage(tabId, request)
      .catch(() => null);
    // 増えた動画は content script の更新通知で一覧に届く。
    setState(
      !isLoadMoreResult(result) || result === "timeout"
        ? "failed"
        : result === "limit"
          ? "limit"
          : "idle",
    );
  }

  function cancel(): void {
    void browser.tabs
      .sendMessage(tabId, { type: LOAD_CANCEL_REQUEST })
      .catch(() => {});
  }

  if (!canLoadMore) {
    return (
      <p className="text-xs text-muted-foreground">{t("panelAllLoaded")}</p>
    );
  }
  if (untilAgeMs !== null && periodLoaded && state !== "loading") {
    return (
      <p className="text-xs text-muted-foreground">{t("panelPeriodLoaded")}</p>
    );
  }
  const buttonClass =
    "h-8 shrink-0 rounded-md border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void load()}
        disabled={state === "loading"}
        className={buttonClass}
      >
        {state === "loading"
          ? t("panelLoadingMore")
          : untilAgeMs === null
            ? t("panelLoadMore")
            : t("panelLoadPeriod")}
      </button>
      {state === "loading" && untilAgeMs !== null ? (
        <button type="button" onClick={cancel} className={buttonClass}>
          {t("panelLoadCancel")}
        </button>
      ) : null}
      {state === "failed" ? (
        <p role="alert" className="text-xs text-destructive">
          {t("panelLoadMoreFailed")}
        </p>
      ) : null}
      {state === "limit" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t("panelLoadLimit", [String(LOAD_UNTIL_MAX_VIDEOS)])}
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
  // 倍率の基準には読み込み済みの全動画を使い、期間は表示だけを絞る。
  const ranking = useMemo(() => rankVideos(snapshot.videos), [snapshot]);
  const [period, setPeriod] = usePeriod();
  const shown =
    ranking.kind === "ranked"
      ? ranking.videos.filter((video) => isWithinPeriod(video, period))
      : [];
  const hiddenCount =
    ranking.kind === "ranked" ? ranking.videos.length - shown.length : 0;
  const untilAgeMs = periodMaxAgeMs(period);
  // 新しい順なので、期間を超える動画が1本でもあれば期間内はすべて読み込み済み。
  const periodLoaded =
    untilAgeMs !== null &&
    snapshot.videos.some((video) => video.ageMs > untilAgeMs);
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LoadMoreButton
            tabId={tabId}
            canLoadMore={snapshot.canLoadMore}
            untilAgeMs={untilAgeMs}
            periodLoaded={periodLoaded}
          />
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>
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
            {shown.map((video, index) => (
              <VideoRow key={video.id} video={video} rank={index + 1} />
            ))}
          </ol>
          {hiddenCount > 0 ? (
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              {t("panelHiddenByPeriod", [String(hiddenCount)])}
            </p>
          ) : null}
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
