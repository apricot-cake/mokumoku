import type { Meta, StoryObj } from "@storybook/react-vite";
import { SidepanelApp } from "../entrypoints/sidepanel/sidepanel-app.tsx";
import { readyPage } from "./fixtures.ts";
import { PanelProvider, type PanelScenario } from "./panel-environment.tsx";

const snapshot = readyPage.snapshot;
if (snapshot.kind !== "ready") throw new Error("ready のサンプルが必要です。");
const partialPage = {
  ...readyPage,
  snapshot: {
    ...snapshot,
    videos: snapshot.videos.filter((video) => video.ageMs < 30 * 86400000),
    canLoadMore: false,
  },
};

const meta = {
  title: "サイドパネル",
  component: SidepanelApp,
  render: (args) => (
    <PanelProvider key={JSON.stringify(args)} scenario={args}>
      <SidepanelApp />
    </PanelProvider>
  ),
  args: { page: readyPage, period: "all", loadState: { kind: "idle" } },
  argTypes: {
    page: { control: false },
    loadState: { control: false },
    period: {
      control: "select",
      options: ["all", "week", "month", "quarter", "halfYear", "year"],
    },
  },
} satisfies Meta<PanelScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ranking: Story = { name: "動画一覧" };

export const LoadingMore: Story = {
  name: "追加読み込み中",
  args: { loadState: { kind: "loading", mode: "more" } },
};
export const LoadingPeriod: Story = {
  name: "期間の読み込み中",
  args: {
    page: partialPage,
    period: "month",
    loadState: { kind: "loading", mode: "period" },
  },
};
export const TimedOut: Story = {
  name: "読み込み失敗・再開",
  args: {
    period: "month",
    page: partialPage,
    loadState: { kind: "done", mode: "period", result: "timeout" },
  },
};
export const AllLoaded: Story = {
  name: "全件読み込み済み",
  args: {
    page: { ...readyPage, snapshot: { ...snapshot, canLoadMore: false } },
  },
};
export const Empty: Story = {
  name: "動画なし",
  args: {
    page: {
      ...readyPage,
      snapshot: { ...snapshot, videos: [], canLoadMore: false, empty: true },
    },
  },
};
export const Insufficient: Story = {
  name: "基準となる動画が不足",
  args: {
    page: {
      ...readyPage,
      snapshot: { ...snapshot, videos: snapshot.videos.slice(0, 4) },
    },
  },
};
export const NotNewest: Story = {
  name: "新しい順への案内",
  args: {
    page: {
      tabId: 1,
      pageVersion: 0,
      snapshot: { kind: "not-newest", channel: "暮らしと道具の記録" },
    },
  },
};
export const Unsupported: Story = {
  name: "対象ページ外",
  args: {
    page: {
      ...readyPage,
      snapshot: { kind: "unsupported" },
    },
  },
};
export const Disconnected: Story = {
  name: "ページとの接続なし",
  args: { page: null },
};
