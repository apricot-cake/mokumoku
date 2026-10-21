import { describe, expect, it } from "vitest";
import { parseAge } from "./age.ts";
import { isPeriodId, isWithinPeriod } from "./period.ts";

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
    expect(isPeriodId("decade")).toBe(false);
  });
});
