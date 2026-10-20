import { describe, expect, it } from "vitest";
import { parseCount } from "./count.ts";

describe("parseCount", () => {
  it.each([
    ["55万回視聴", 550000],
    ["1716万回視聴", 17160000],
    ["1.2億回視聴", 120000000],
    ["1,234 回視聴", 1234],
    ["1,234 views", 1234],
    ["550K views", 550000],
    ["1.2M views", 1200000],
    ["2.3B views", 2300000000],
    ["1,2 Mio. Aufrufe", 1200000],
    ["조회수 3.4만회", 34000],
    ["１２万回視聴", 120000],
  ])("%s → %d", (text, expected) => {
    expect(parseCount(text)).toBe(expected);
  });

  it("数字のない表記は 0", () => {
    expect(parseCount("No views")).toBe(0);
    expect(parseCount("視聴なし")).toBe(0);
  });

  it("桁を決められない単位は NaN", () => {
    expect(parseCount("1,2 T")).toBeNaN();
  });
});
