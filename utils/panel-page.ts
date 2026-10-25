// パネルを開いたページから離れたかの判定。パネルはタブ専用で、別のページへ
// 移ったら閉じる。

import { channelRoot } from "./youtube-page.ts";

/** background が content script にチャンネル ID を問い合わせるメッセージ。 */
export const CHANNEL_REQUEST = "mokumoku:channel-request";
/** content script が、表示中のチャンネルが変わったときに送るメッセージ。 */
export const CHANNEL_UPDATE = "mokumoku:channel";

/** タブごとに保存し、別タブの更新と競合させない。 */
export function panelOwnerKey(tabId: number): string {
  return `panelOwner:${tabId}`;
}

export interface ChannelUpdate {
  readonly type: typeof CHANNEL_UPDATE;
  readonly channelId: string | null;
}

export function isChannelUpdate(value: unknown): value is ChannelUpdate {
  if (typeof value !== "object" || value === null) return false;
  const update = value as Partial<ChannelUpdate>;
  return (
    update.type === CHANNEL_UPDATE &&
    (update.channelId === null || typeof update.channelId === "string")
  );
}

/**
 * ページを見分けるキー。同じチャンネル内の移動（「ホーム」から「動画」タブへ
 * など）は同じページとして扱う。チャンネル以外は、パスとクエリが同じなら
 * 同じページ（`/watch?v=` は動画ごとに別のページ）。URL を読めないページ
 * （拡張機能に権限のないサイト）は null。
 */
export function panelPageKey(url: string | undefined): string | null {
  if (url === undefined) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const channel = channelRoot(parsed.pathname);
  return channel === null
    ? `${parsed.origin}${parsed.pathname}${parsed.search}`
    : `${parsed.origin}${channel}`;
}

function isChannelUrl(url: string): boolean {
  try {
    return channelRoot(new URL(url).pathname) !== null;
  } catch {
    return false;
  }
}

export interface PanelOwner {
  readonly tabId: number;
  readonly windowId: number;
  /** Chrome が実際に開いたパネルの範囲。全タブ共通なら null。 */
  readonly panelTabId: number | null;
  readonly pageKey: string | null;
  /** パネルを開いたチャンネルの ID。チャンネル以外のページや、読めなければ null。 */
  readonly channelId: string | null;
}

export function isPanelOwner(value: unknown): value is PanelOwner {
  if (typeof value !== "object" || value === null) return false;
  const owner = value as Partial<PanelOwner>;
  return (
    typeof owner.tabId === "number" &&
    typeof owner.windowId === "number" &&
    (owner.panelTabId === null || typeof owner.panelTabId === "number") &&
    (owner.pageKey === null || typeof owner.pageKey === "string") &&
    (owner.channelId === null || typeof owner.channelId === "string")
  );
}

/**
 * パネルを開いたタブが更新されたとき、パネルを閉じるべきか。`url` は変化後の
 * URL（読めなければ undefined）、`loading` はページの読み込みが始まったか。
 *
 * 同じチャンネルでも、`/channel/ID` などから開いてタブを移ると YouTube は
 * `@ハンドル` の URL に切り替える。チャンネル ID が分かっていれば、チャンネル
 * 同士の移動は URL では判断せず、{@link hasLeftPanelChannel} に任せる。
 */
export function hasLeftPanelPage(
  owner: PanelOwner,
  change: { readonly url?: string; readonly loading: boolean },
): boolean {
  if (change.url !== undefined) {
    if (owner.channelId !== null && isChannelUrl(change.url)) return false;
    return panelPageKey(change.url) !== owner.pageKey;
  }
  // URL を読めない読み込みは、権限のないサイトでの遷移か、権限のないサイトへ
  // 出ていく遷移。どちらもパネルを開いたページではなくなる。
  return change.loading;
}

/**
 * content script が読んだチャンネルが、パネルを開いたチャンネルと違うか。
 * 遷移の途中で読めなかった（null）ときは判断しない。
 */
export function hasLeftPanelChannel(
  owner: PanelOwner,
  channelId: string | null,
): boolean {
  return (
    owner.channelId !== null &&
    channelId !== null &&
    channelId !== owner.channelId
  );
}
