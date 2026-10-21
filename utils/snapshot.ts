// content script がサイドパネルへ渡す、ページの読み取り結果。

export interface VideoEntry {
  readonly id: string;
  readonly title: string;
  readonly views: number;
  readonly ageMs: number;
  /** YouTube が表示した経過時間の表記。パネルでもそのまま見せる。 */
  readonly ageText: string;
}

export type PageSnapshot =
  | { readonly kind: "unsupported" }
  | { readonly kind: "not-newest"; readonly channel: string }
  | {
      readonly kind: "ready";
      readonly channel: string;
      readonly videos: readonly VideoEntry[];
      /** 一覧の続きがあり、追加で読み込めるか。 */
      readonly canLoadMore: boolean;
    };

export const SNAPSHOT_REQUEST = "mokumoku:snapshot-request";
export const SNAPSHOT_UPDATE = "mokumoku:snapshot";
export const LOAD_MORE_REQUEST = "mokumoku:load-more";

/** 追加読み込みの結果。end は一覧の最後まで読み込み済み。 */
export type LoadMoreResult = "loaded" | "end" | "timeout";

export function isLoadMoreResult(value: unknown): value is LoadMoreResult {
  return value === "loaded" || value === "end" || value === "timeout";
}

export interface SnapshotUpdate {
  readonly type: typeof SNAPSHOT_UPDATE;
  readonly snapshot: PageSnapshot;
}

function isVideoEntry(value: unknown): value is VideoEntry {
  if (typeof value !== "object" || value === null) return false;
  const video = value as Partial<VideoEntry>;
  return (
    typeof video.id === "string" &&
    typeof video.title === "string" &&
    typeof video.views === "number" &&
    typeof video.ageMs === "number" &&
    typeof video.ageText === "string"
  );
}

export function isPageSnapshot(value: unknown): value is PageSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  switch (snapshot.kind) {
    case "unsupported":
      return true;
    case "not-newest":
      return typeof snapshot.channel === "string";
    case "ready":
      return (
        typeof snapshot.channel === "string" &&
        Array.isArray(snapshot.videos) &&
        typeof snapshot.canLoadMore === "boolean" &&
        snapshot.videos.every(isVideoEntry)
      );
    default:
      return false;
  }
}

export function isSnapshotUpdate(value: unknown): value is SnapshotUpdate {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<SnapshotUpdate>).type === SNAPSHOT_UPDATE &&
    isPageSnapshot((value as Partial<SnapshotUpdate>).snapshot)
  );
}
