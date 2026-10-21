import { useEffect, useMemo, useRef } from "react";
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
import type { PageSnapshot } from "../../utils/snapshot.ts";
import { type LoadState, useLoader } from "./use-loader.ts";
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
  // 選ぶと表示を絞るだけでなく、その範囲まで読み込むことをラベルで示す。
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {t("panelPeriodLabel")}
      <select
        value={value}
        onChange={(event) => {
          if (isPeriodId(event.target.value)) onChange(event.target.value);
        }}
        className="h-8 shrink-0 rounded-md border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
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
        <span className="w-5 shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">
          {rank ?? "–"}
        </span>
        {/* サイドパネルの幅が狭いときはサムネイルを小さくし、タイトルの幅を確保する。 */}
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="aspect-video w-24 shrink-0 self-start rounded object-cover min-[400px]:w-28"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-sm leading-snug text-foreground">
            {video.title}
          </p>
          <span
            className="w-fit rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground tabular-nums"
            title={t("panelRatioDescription")}
          >
            ×{ratioNumber.format(video.ratio)}
          </span>
          <p className="truncate text-xs text-muted-foreground">
            {t("panelViews", [compactNumber.format(video.views)])} ·{" "}
            {video.ageText}
          </p>
        </div>
      </a>
    </li>
  );
}

const linkButtonClass =
  "shrink-0 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring";

/** ヘッダーの下の状態の行。読み込み中・完了・中断のどれでも高さを変えない。 */
function StatusLine({
  period,
  state,
  loadedCount,
  shownCount,
  periodLoaded,
  onCancel,
  onResume,
}: {
  period: PeriodId;
  state: LoadState;
  loadedCount: number;
  shownCount: number;
  periodLoaded: boolean;
  onCancel: () => void;
  onResume: () => void;
}) {
  const summary = () => t("panelRangeCount", [String(shownCount)]);
  let text: string;
  let action: { label: string; onClick: () => void } | null = null;
  if (state.kind === "loading") {
    text = t("panelLoadingCount", [String(loadedCount)]);
    if (state.mode === "period")
      action = { label: t("panelLoadCancel"), onClick: onCancel };
  } else if (period === "all") {
    text =
      state.kind === "done" &&
      state.mode === "more" &&
      state.result === "timeout"
        ? t("panelLoadMoreFailed")
        : t("panelLoadedCount", [String(loadedCount)]);
  } else if (
    state.kind === "done" &&
    state.mode === "period" &&
    !periodLoaded &&
    (state.result === "limit" ||
      state.result === "cancelled" ||
      state.result === "timeout")
  ) {
    // 期間に届く前に止まったときは、理由と続きの操作を示す。
    text =
      state.result === "limit"
        ? t("panelLoadLimit", [String(LOAD_UNTIL_MAX_VIDEOS)])
        : state.result === "cancelled"
          ? t("panelLoadCancelled")
          : t("panelLoadMoreFailed");
    action = { label: t("panelLoadResume"), onClick: onResume };
  } else {
    text = summary();
  }
  return (
    <div className="flex h-5 items-center gap-2 text-xs text-muted-foreground">
      <p role="status" className="min-w-0 truncate">
        {text}
      </p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={linkButtonClass}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** 「手動」のときにヘッダーへ置く、1回分の追加読み込み。 */
function LoadMoreButton({
  canLoadMore,
  loading,
  onLoad,
}: {
  canLoadMore: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLoad}
      disabled={loading || !canLoadMore}
      className="h-8 shrink-0 rounded-md border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {!canLoadMore
        ? t("panelAllLoaded")
        : loading
          ? t("panelLoadingMore")
          : t("panelLoadMore")}
    </button>
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
  const { state, run, cancel } = useLoader(tabId);
  const shown =
    ranking.kind === "ranked"
      ? ranking.videos.filter((video) => isWithinPeriod(video, period))
      : [];
  const hiddenCount =
    ranking.kind === "ranked" ? ranking.videos.length - shown.length : 0;
  const freshCount = ranking.kind === "ranked" ? ranking.fresh.length : 0;
  const untilAgeMs = periodMaxAgeMs(period);
  // 新しい順なので、期間を超える動画が1本でもあれば期間内はすべて読み込み済み。
  const periodLoaded =
    untilAgeMs !== null &&
    snapshot.videos.some((video) => video.ageMs > untilAgeMs);

  // 期間を選んだら（保存済みの期間で開いたときも）、期間を超える動画まで
  // 自動で読み込む。一覧が増えるたびに始め直さないよう、期間の変化だけを
  // 契機にし、読み込み状況は最新の値を参照する。
  const latest = useRef({ canLoadMore: snapshot.canLoadMore, periodLoaded });
  latest.current = { canLoadMore: snapshot.canLoadMore, periodLoaded };
  useEffect(() => {
    const maxAgeMs = periodMaxAgeMs(period);
    const { canLoadMore, periodLoaded } = latest.current;
    if (maxAgeMs !== null && canLoadMore && !periodLoaded) void run(maxAgeMs);
  }, [period, run]);

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-4 pt-3 pb-2">
        <h1 className="truncate text-base font-semibold text-foreground">
          {snapshot.channel}
        </h1>
        <div className="flex items-center justify-between gap-2">
          <PeriodSelect value={period} onChange={setPeriod} />
          {period === "all" ? (
            <LoadMoreButton
              canLoadMore={snapshot.canLoadMore}
              loading={state.kind === "loading"}
              onLoad={() => void run(null)}
            />
          ) : null}
        </div>
        <StatusLine
          period={period}
          state={state}
          loadedCount={snapshot.videos.length}
          shownCount={shown.length + freshCount}
          periodLoaded={periodLoaded}
          onCancel={cancel}
          onResume={() => {
            if (untilAgeMs !== null) void run(untilAgeMs);
          }}
        />
        {state.kind === "loading" ? (
          // 進み具合は事前に分からないので、値を持たない不確定の進捗バーにする。
          <progress
            aria-label={t("panelLoadingMore")}
            className="absolute inset-x-0 bottom-0 h-0.5 w-full"
          />
        ) : null}
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
