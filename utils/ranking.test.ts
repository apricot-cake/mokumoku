import { describe, expect, it } from "vitest";
import { rankVideos } from "./ranking.ts";

const DAY = 24 * 60 * 60 * 1000;

function video(id: string, views: number, days: number) {
  return { id, title: id, views, ageMs: days * DAY, ageText: `${days} 日前` };
}

describe("rankVideos", () => {
  it("倍率の高い順に並べ、公開1日未満は別に分ける", () => {
    const typical = [1, 2, 4, 7, 14, 30, 60, 90, 180, 365].map((days) =>
      video(`d${days}`, Math.round(10000 * Math.sqrt(days)), days),
    );
    const ranking = rankVideos([
      video("fresh", 8000, 0.5),
      video("rising", 60000, 3),
      ...typical,
    ]);
    expect(ranking.kind).toBe("ranked");
    if (ranking.kind !== "ranked") return;
    expect(ranking.videos[0]?.id).toBe("rising");
    expect(ranking.videos.map((v) => v.id)).not.toContain("fresh");
    expect(ranking.fresh.map((v) => v.id)).toEqual(["fresh"]);
    expect(ranking.videos).toHaveLength(11);
  });

  it("基準を出せなければ insufficient", () => {
    expect(rankVideos([video("a", 1, 2)])).toEqual({ kind: "insufficient" });
  });
});
