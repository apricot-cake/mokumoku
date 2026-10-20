import { useMemo } from "react";
import { t } from "../../utils/i18n.ts";
import { type RankedVideo, rankVideos } from "../../utils/ranking.ts";
import { MIN_BASELINE_SAMPLES } from "../../utils/score.ts";
import type { PageSnapshot } from "../../utils/snapshot.ts";
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

function ChannelRanking({
  snapshot,
}: {
  snapshot: Extract<PageSnapshot, { kind: "ready" }>;
}) {
  const ranking = useMemo(() => rankVideos(snapshot.videos), [snapshot]);
  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h1 className="truncate text-base font-semibold text-foreground">
          {snapshot.channel}
        </h1>
        <p className="text-xs text-muted-foreground">
          {t("panelLoadedCount", [String(snapshot.videos.length)])}
        </p>
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
  const snapshot = usePageSnapshot();
  if (snapshot === undefined) return null;
  if (snapshot === null || snapshot.kind === "unsupported") {
    return (
      <Notice
        title={t("panelOpenChannel")}
        hint={snapshot === null ? t("panelReloadHint") : undefined}
      />
    );
  }
  if (snapshot.kind === "not-newest") {
    return (
      <Notice
        title={t("panelSwitchToNewest")}
        hint={t("panelSwitchToNewestHint")}
      />
    );
  }
  return <ChannelRanking snapshot={snapshot} />;
}
