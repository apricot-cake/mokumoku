import { fitBaseline, isProvisional, viewRatio } from "./score.ts";
import type { VideoEntry } from "./snapshot.ts";

export interface RankedVideo extends VideoEntry {
  readonly ratio: number;
}

export type Ranking =
  | { readonly kind: "insufficient" }
  | {
      readonly kind: "ranked";
      readonly videos: readonly RankedVideo[];
      /**
       * 公開1日未満の動画。基準の外側へ外挿した値なので倍率が大きく振れ、
       * 順位には入れず別に並べる。
       */
      readonly fresh: readonly RankedVideo[];
    };

function byRatio(a: RankedVideo, b: RankedVideo): number {
  return b.ratio - a.ratio;
}

export function rankVideos(videos: readonly VideoEntry[]): Ranking {
  const baseline = fitBaseline(videos);
  if (baseline === null) return { kind: "insufficient" };
  const ranked: RankedVideo[] = [];
  const fresh: RankedVideo[] = [];
  for (const video of videos) {
    const ratio = viewRatio(baseline, video);
    if (ratio === null) continue;
    (isProvisional(video) ? fresh : ranked).push({ ...video, ratio });
  }
  return {
    kind: "ranked",
    videos: ranked.sort(byRatio),
    fresh: fresh.sort(byRatio),
  };
}
