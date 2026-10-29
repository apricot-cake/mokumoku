import type { PageState } from "../entrypoints/sidepanel/use-page-snapshot.ts";
import type { VideoEntry } from "../utils/snapshot.ts";

const DAY = 24 * 60 * 60 * 1000;
const titles = [
  "新しい道具で、いつもの作業を少し楽にする",
  "休日の散歩で見つけた小さなお店と、コーヒーの時間",
  "使い続けて分かったこと — デスク周りを見直しました",
  "初めての挑戦。準備から完成までの記録",
];

function video(index: number, days: number): VideoEntry {
  return {
    id: `storybook-${index}`,
    title: titles[index % titles.length] ?? "作業の記録",
    views: Math.round(10000 * Math.sqrt(days) * (index % 4 === 0 ? 3.2 : 1)),
    ageMs: days * DAY,
    ageText: days < 1 ? "6時間前" : `${days}日前`,
  };
}

export const moreVideos = [90, 120, 180, 210, 270, 365, 400, 500].map(
  (days, index) => video(index + 20, days),
);

export const readyPage: PageState = {
  tabId: 1,
  pageVersion: 0,
  snapshot: {
    kind: "ready",
    channel: "暮らしと道具の記録",
    videos: [0.25, 1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60].map(
      (days, index) => video(index, days),
    ),
    canLoadMore: true,
    empty: false,
  },
};
