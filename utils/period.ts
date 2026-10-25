import { AGE_UNIT_MS } from "./age.ts";

// パネルの一覧に出す動画の公開時期。経過時間は「3 か月前」のような表記から
// 読むので、境界も同じ単位の長さで決め、「3 か月前」を「3か月以内」に含める。
export const PERIODS = [
  { id: "all", maxAgeMs: null },
  { id: "week", maxAgeMs: AGE_UNIT_MS.week },
  { id: "month", maxAgeMs: AGE_UNIT_MS.month },
  { id: "quarter", maxAgeMs: 3 * AGE_UNIT_MS.month },
  { id: "halfYear", maxAgeMs: 6 * AGE_UNIT_MS.month },
  { id: "year", maxAgeMs: AGE_UNIT_MS.year },
  { id: "custom", maxAgeMs: null },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export type CustomPeriod = {
  readonly value: number;
  readonly unit: "day" | "month" | "year";
};

export function isPeriodId(value: unknown): value is PeriodId {
  return PERIODS.some((period) => period.id === value);
}

/** 期間の長さ。「すべて」と未指定・無効な値は null。 */
export function periodMaxAgeMs(
  period: PeriodId,
  custom?: CustomPeriod,
): number | null {
  if (period === "custom") {
    if (
      custom === undefined ||
      !Number.isInteger(custom.value) ||
      custom.value <= 0
    )
      return null;
    const duration = custom.value * AGE_UNIT_MS[custom.unit];
    return Number.isSafeInteger(duration) ? duration : null;
  }
  return PERIODS.find((item) => item.id === period)?.maxAgeMs ?? null;
}

export function isWithinPeriod(
  video: { readonly ageMs: number },
  period: PeriodId,
  custom?: CustomPeriod,
): boolean {
  const maxAgeMs = periodMaxAgeMs(period, custom);
  return maxAgeMs === null || video.ageMs <= maxAgeMs;
}
