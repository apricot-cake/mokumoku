import { useEffect, useId, useMemo, useRef, useState } from "react";
import { t } from "../../utils/i18n.ts";
import { LOAD_UNTIL_MAX_VIDEOS } from "../../utils/load-more.ts";
import {
  type CustomPeriod,
  isPeriodId,
  isWithinPeriod,
  PERIODS,
  type PeriodId,
  periodMaxAgeMs,
} from "../../utils/period.ts";
import { type RankedVideo, rankVideos } from "../../utils/ranking.ts";
import { MIN_BASELINE_SAMPLES } from "../../utils/score.ts";
import type { PageSnapshot } from "../../utils/snapshot.ts";
import { Badge } from "./components/ui/badge.tsx";
import { Button } from "./components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./components/ui/empty.tsx";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { Progress } from "./components/ui/progress.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select.tsx";
import { Separator } from "./components/ui/separator.tsx";
import { cn } from "./lib/utils.ts";
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
  custom: () => t("panelPeriodCustom"),
};

function PeriodSelect({
  value,
  onChange,
}: {
  value: PeriodId;
  onChange: (period: PeriodId) => void;
}) {
  const id = useId();
  const items = PERIODS.map(({ id }) => ({
    value: id,
    label: PERIOD_LABELS[id](),
  }));
  // 選ぶと表示を絞るだけでなく、その範囲まで読み込むことをラベルで示す。
  return (
    <Field
      orientation="horizontal"
      className="w-auto shrink-0 *:data-[slot=field-label]:flex-none"
    >
      <FieldLabel htmlFor={id} className="whitespace-nowrap">
        {t("panelPeriodLabel")}
      </FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (isPeriodId(next)) onChange(next);
        }}
      >
        <SelectTrigger id={id} aria-label={t("panelPeriodLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function CustomPeriodForm({
  onApply,
}: {
  onApply: (period: CustomPeriod) => void;
}) {
  const [value, setValue] = useState("30");
  const [unit, setUnit] = useState<CustomPeriod["unit"]>("day");
  const id = useId();
  const units = [
    { value: "day", label: t("panelPeriodDay") },
    { value: "month", label: t("panelPeriodMonthUnit") },
    { value: "year", label: t("panelPeriodYearUnit") },
  ];
  const draft = { value: Number(value), unit };
  const valid = periodMaxAgeMs("custom", draft) !== null;
  return (
    <form
      className="w-72 max-w-full shrink-0"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onApply(draft);
      }}
    >
      <FieldGroup className="w-auto flex-row items-center gap-2">
        <Field
          orientation="horizontal"
          className="w-auto shrink-0 *:data-[slot=field-label]:flex-none"
          data-invalid={!valid || undefined}
        >
          <FieldLabel htmlFor={id} className="whitespace-nowrap">
            {t("panelPeriodAmount")}
          </FieldLabel>
          <Input
            id={id}
            type="number"
            min="1"
            step="1"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={!valid || undefined}
            className="w-20 flex-none"
          />
        </Field>
        <Select
          items={units}
          value={unit}
          onValueChange={(next) => {
            if (next === "day" || next === "month" || next === "year")
              setUnit(next);
          }}
        >
          <SelectTrigger
            aria-label={t("panelPeriodUnit")}
            className="w-auto min-w-16 shrink-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {units.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!valid}>
          {t("panelPeriodApply")}
        </Button>
      </FieldGroup>
    </form>
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
    <Empty className="items-start p-4 text-left text-wrap">
      <EmptyHeader className="max-w-none items-start">
        <EmptyTitle>{title}</EmptyTitle>
        {hint ? <EmptyDescription>{hint}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

function VideoRow({ video }: { video: RankedVideo }) {
  return (
    <li>
      <a
        href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
        target="_blank"
        rel="noreferrer"
        className="flex gap-3 rounded-md p-2 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        {/* サイドパネルの幅が狭いときはサムネイルを小さくし、タイトルの幅を確保する。 */}
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="aspect-video w-24 shrink-0 self-start rounded object-cover min-[400px]:w-28"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate text-sm leading-snug text-foreground"
              title={video.title}
            >
              {video.title}
            </p>
            <Badge
              variant="secondary"
              className="tabular-nums"
              title={t("panelRatioDescription")}
            >
              ×{ratioNumber.format(video.ratio)}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {t("panelViews", [compactNumber.format(video.views)])} ·{" "}
            {video.ageText}
          </p>
        </div>
      </a>
    </li>
  );
}

/** チャンネル名の横に置く件数と読み込み状態。長い文は省略し、操作は残す。 */
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
    <div className="flex h-5 min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      <p role="status" title={text} className="min-w-0 truncate">
        {text}
      </p>
      {action ? (
        <Button type="button" onClick={action.onClick} variant="link" size="xs">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/** 「期間指定なし」のときにヘッダーへ置く、1回分の追加読み込み。 */
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
    <Button
      type="button"
      variant="outline"
      onClick={onLoad}
      disabled={loading || !canLoadMore}
    >
      {!canLoadMore
        ? t("panelAllLoaded")
        : loading
          ? t("panelLoadingMore")
          : t("panelLoadMore")}
    </Button>
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
  const [customPeriod, setCustomPeriod] = useState<CustomPeriod>();
  const { state, run, cancel } = useLoader(tabId);
  const shown =
    ranking.kind === "ranked"
      ? ranking.videos.filter((video) =>
          isWithinPeriod(video, period, customPeriod),
        )
      : [];
  const hiddenCount =
    ranking.kind === "ranked" ? ranking.videos.length - shown.length : 0;
  const freshCount = ranking.kind === "ranked" ? ranking.fresh.length : 0;
  const untilAgeMs = periodMaxAgeMs(period, customPeriod);
  // 新しい順なので、期間を超える動画が1本でもあれば期間内はすべて読み込み済み。
  const periodLoaded =
    untilAgeMs !== null &&
    snapshot.videos.some((video) => video.ageMs > untilAgeMs);

  // 期間を選んだら、その範囲を超えるまで読み込む。続きがまだなければ待つ。
  // 開始後の一覧更新、中止・失敗後には自動で再開しない。
  const selection = period === "custom" ? customPeriod : period;
  const autoLoad = useRef({ selection, started: false });
  const canLoadMore = snapshot.canLoadMore;
  useEffect(() => {
    if (autoLoad.current.selection !== selection)
      autoLoad.current = { selection, started: false };
    const maxAgeMs = untilAgeMs;
    if (
      maxAgeMs !== null &&
      canLoadMore &&
      !periodLoaded &&
      !autoLoad.current.started
    ) {
      autoLoad.current.started = true;
      void run(maxAgeMs);
    }
  }, [selection, untilAgeMs, run, canLoadMore, periodLoaded]);

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 max-w-[60%] truncate text-base font-semibold text-foreground">
            {snapshot.channel}
          </h1>
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn(period === "all" && "grow")}>
            <PeriodSelect
              value={period}
              onChange={(next) => {
                if (state.kind === "loading") cancel();
                setCustomPeriod(undefined);
                setPeriod(next);
              }}
            />
          </div>
          {period === "all" ? (
            <LoadMoreButton
              canLoadMore={snapshot.canLoadMore}
              loading={state.kind === "loading"}
              onLoad={() => void run(null)}
            />
          ) : null}
          {period === "custom" ? (
            <CustomPeriodForm onApply={setCustomPeriod} />
          ) : null}
        </div>
        {state.kind === "loading" ? (
          // 進み具合は事前に分からないので、値を持たない不確定の進捗バーにする。
          <Progress
            aria-label={t("panelLoadingMore")}
            value={null}
            className="absolute inset-x-0 bottom-0"
          />
        ) : null}
      </header>
      {snapshot.videos.length === 0 ? (
        <Notice title={t(snapshot.empty ? "panelNoVideos" : "panelEmpty")} />
      ) : ranking.kind === "insufficient" ? (
        <Notice
          title={t("panelInsufficient", [String(MIN_BASELINE_SAMPLES)])}
        />
      ) : (
        <>
          <ol className="flex flex-col p-2">
            {shown.map((video) => (
              <VideoRow key={video.id} video={video} />
            ))}
          </ol>
          {hiddenCount > 0 ? (
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              {t("panelHiddenByPeriod", [String(hiddenCount)])}
            </p>
          ) : null}
          {ranking.fresh.length > 0 ? (
            <section className="flex flex-col">
              <Separator />
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
  if (page?.snapshot.kind === "loading")
    return <Notice title={t("panelEmpty")} />;
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
  // ページが変わったら期間と読み込み表示を初期化する。一覧更新では維持する。
  return (
    <ChannelRanking
      key={`${page.tabId}:${page.pageVersion}`}
      tabId={page.tabId}
      snapshot={snapshot}
    />
  );
}
