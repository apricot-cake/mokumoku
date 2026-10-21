import { describe, expect, it } from "vitest";
import {
  isLoadMoreRequest,
  isLoadMoreResult,
  isPageSnapshot,
  isSnapshotUpdate,
  SNAPSHOT_UPDATE,
} from "./snapshot.ts";

const video = { id: "a1", title: "t", views: 1, ageMs: 1, ageText: "1 日前" };

describe("isPageSnapshot", () => {
  it("正しい形を受け付ける", () => {
    expect(isPageSnapshot({ kind: "unsupported" })).toBe(true);
    expect(isPageSnapshot({ kind: "not-newest", channel: "c" })).toBe(true);
    expect(
      isPageSnapshot({
        kind: "ready",
        channel: "c",
        videos: [video],
        canLoadMore: true,
      }),
    ).toBe(true);
  });

  it("欠けた形を拒む", () => {
    expect(isPageSnapshot(null)).toBe(false);
    expect(isPageSnapshot({ kind: "ready", channel: "c" })).toBe(false);
    expect(
      isPageSnapshot({
        kind: "ready",
        channel: "c",
        videos: [{ ...video, views: "1" }],
        canLoadMore: true,
      }),
    ).toBe(false);
  });

  it("更新通知を判別する", () => {
    expect(
      isSnapshotUpdate({
        type: SNAPSHOT_UPDATE,
        snapshot: { kind: "unsupported" },
      }),
    ).toBe(true);
    expect(isSnapshotUpdate({ type: "other", snapshot: {} })).toBe(false);
  });
});

describe("追加読み込みのメッセージ", () => {
  it("依頼の形を判別する", () => {
    expect(isLoadMoreRequest({ type: "mokumoku:load-more" })).toBe(true);
    expect(
      isLoadMoreRequest({ type: "mokumoku:load-more", untilAgeMs: 1000 }),
    ).toBe(true);
    expect(
      isLoadMoreRequest({ type: "mokumoku:load-more", untilAgeMs: -1 }),
    ).toBe(false);
    expect(isLoadMoreRequest({ type: "other" })).toBe(false);
  });

  it("結果の値を判別する", () => {
    expect(isLoadMoreResult("reached")).toBe(true);
    expect(isLoadMoreResult("done")).toBe(false);
  });
});
