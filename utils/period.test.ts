import { describe, expect, it } from "vitest";
import { AGE_UNIT_MS, parseAge } from "./age.ts";
import {
  type CustomPeriod,
  isPeriodId,
  isWithinPeriod,
  periodMaxAgeMs,
} from "./period.ts";

describe("isWithinPeriod", () => {
  it("境界と同じ表記の動画は期間に含める", () => {
    expect(isWithinPeriod({ ageMs: parseAge("3 か月前") }, "quarter")).toBe(
      true,
    );
    expect(isWithinPeriod({ ageMs: parseAge("4 か月前") }, "quarter")).toBe(
      false,
    );
    expect(isWithinPeriod({ ageMs: parseAge("1 週間前") }, "week")).toBe(true);
    expect(isWithinPeriod({ ageMs: parseAge("8 日前") }, "week")).toBe(false);
    expect(isWithinPeriod({ ageMs: parseAge("1 年前") }, "year")).toBe(true);
  });

  it("すべてなら古さを問わない", () => {
    expect(isWithinPeriod({ ageMs: parseAge("10 年前") }, "all")).toBe(true);
  });

  it("期間の ID を判別する", () => {
    expect(isPeriodId("month")).toBe(true);
    expect(isPeriodId("custom")).toBe(true);
    expect(isPeriodId("decade")).toBe(false);
  });
});

describe("値と単位を指定した期間", () => {
  it.each(["day", "month", "year"] as const)(
    "%s 単位で指定した期間ちょうどの動画まで含める",
    (unit) => {
      const custom: CustomPeriod = { value: 2, unit };
      const duration = 2 * AGE_UNIT_MS[unit];
      expect(periodMaxAgeMs("custom", custom)).toBe(duration);
      expect(isWithinPeriod({ ageMs: duration }, "custom", custom)).toBe(true);
      expect(isWithinPeriod({ ageMs: duration + 1 }, "custom", custom)).toBe(
        false,
      );
    },
  );

  it("値が未指定なら期間へ変換しない", () => {
    expect(periodMaxAgeMs("custom")).toBeNull();
  });

  it.each([0, -1, 0.5, Number.NaN, Infinity, -Infinity, 1e100])(
    "無効な値 %s を期間へ変換しない",
    (value) => {
      expect(periodMaxAgeMs("custom", { value, unit: "day" })).toBeNull();
    },
  );

  it.each(["day", "month", "year"] as const)(
    "%s のミリ秒を安全な整数で扱える最大値まで受け付ける",
    (unit) => {
      const maxValue = Math.floor(Number.MAX_SAFE_INTEGER / AGE_UNIT_MS[unit]);
      expect(periodMaxAgeMs("custom", { value: maxValue, unit })).toBe(
        maxValue * AGE_UNIT_MS[unit],
      );
      expect(
        periodMaxAgeMs("custom", { value: maxValue + 1, unit }),
      ).toBeNull();
    },
  );

  it("月・年の長さは既存プリセットと一致する", () => {
    expect(periodMaxAgeMs("custom", { value: 1, unit: "month" })).toBe(
      periodMaxAgeMs("month"),
    );
    expect(periodMaxAgeMs("custom", { value: 1, unit: "year" })).toBe(
      periodMaxAgeMs("year"),
    );
  });

  it("値と単位の指定は既存のプリセットへ影響しない", () => {
    const custom: CustomPeriod = { value: 45, unit: "day" };
    expect(periodMaxAgeMs("month", custom)).toBe(AGE_UNIT_MS.month);
    expect(periodMaxAgeMs("all", custom)).toBeNull();
  });
});
