import { describe, expect, it } from "vitest";
import {
  fitBaseline,
  isProvisional,
  MIN_BASELINE_SAMPLES,
  viewRatio,
} from "./score.ts";

const DAY = 24 * 60 * 60 * 1000;

// 経過日数の平方根に比例して伸びる、典型的なチャンネル。
function typicalVideo(days: number) {
  return { views: Math.round(10000 * Math.sqrt(days)), ageMs: days * DAY };
}

const typical = [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map(typicalVideo);

function fitOrThrow(videos: Parameters<typeof fitBaseline>[0]) {
  const baseline = fitBaseline(videos);
  if (baseline === null) throw new Error("基準を出せなかった");
  return baseline;
}

describe("fitBaseline", () => {
  it("経過時間に対する伸び方を推定する", () => {
    const baseline = fitOrThrow(typical);
    expect(baseline.slope).toBeCloseTo(0.5, 2);
    expect(viewRatio(baseline, typicalVideo(10))).toBeCloseTo(1, 1);
  });

  it("新しいのに伸びている動画は、累積が少なくても倍率が高い", () => {
    const baseline = fitOrThrow(typical);
    const risingNew = { views: 60000, ageMs: 2 * DAY };
    const bigOld = { views: 150000, ageMs: 365 * DAY };
    expect(viewRatio(baseline, risingNew)).toBeGreaterThan(3);
    expect(viewRatio(baseline, bigOld)).toBeLessThan(1);
  });

  it("伸びた動画が混ざっても基準は引き上げられない", () => {
    const withOutliers = [
      ...typical,
      { views: 5000000, ageMs: 5 * DAY },
      { views: 8000000, ageMs: 20 * DAY },
    ];
    const baseline = fitOrThrow(withOutliers);
    expect(viewRatio(baseline, typicalVideo(10))).toBeCloseTo(1, 0);
  });

  it("古い動画ほど少ないチャンネルでは、傾きを 0 で止める", () => {
    const shrinking = [1, 3, 10, 30, 100, 300, 600, 900].map((days) => ({
      views: Math.round(1000000 / days),
      ageMs: days * DAY,
    }));
    expect(fitBaseline(shrinking)?.slope).toBe(0);
  });

  it("動画数が足りなければ null", () => {
    expect(fitBaseline(typical.slice(0, MIN_BASELINE_SAMPLES - 1))).toBeNull();
  });

  it("公開1日未満の動画は基準に入れない", () => {
    const fresh = Array.from({ length: 20 }, () => ({
      views: 100,
      ageMs: DAY / 2,
    }));
    expect(fitBaseline(fresh)).toBeNull();
    expect(isProvisional({ views: 100, ageMs: DAY / 2 })).toBe(true);
  });

  it("経過時間がほぼ同じ動画だけでは null", () => {
    const sameAge = Array.from({ length: 20 }, (_, index) => ({
      views: 1000 + index,
      ageMs: 30.4375 * DAY,
    }));
    expect(fitBaseline(sameAge)).toBeNull();
  });
});
