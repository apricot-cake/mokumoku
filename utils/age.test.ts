import { describe, expect, it } from "vitest";
import { parseAge } from "./age.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("parseAge", () => {
  it.each([
    ["16 時間前", 16 * HOUR],
    ["11 日前", 11 * DAY],
    ["2 週間前", 14 * DAY],
    ["1 か月前", 30.4375 * DAY],
    ["3 年前", 3 * 365.25 * DAY],
    ["2 日前に配信済み", 2 * DAY],
    ["16 hours ago", 16 * HOUR],
    ["Streamed 3 days ago", 3 * DAY],
    ["1 month ago", 30.4375 * DAY],
    ["3일 전", 3 * DAY],
    ["hace 2 semanas", 14 * DAY],
    ["há 5 dias", 5 * DAY],
  ])("%s", (text, expected) => {
    expect(parseAge(text)).toBeCloseTo(expected);
  });

  it("相対表記でなければ NaN", () => {
    expect(parseAge("55万回視聴")).toBeNaN();
    expect(parseAge("プレミア公開予定")).toBeNaN();
  });
});
