// パネルを開いたページから離れたかの判定。パネルはタブ専用で、別のページへ
// 移ったら閉じる。

const CHANNEL_ROOT = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/;

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
  const channel = CHANNEL_ROOT.exec(parsed.pathname)?.[0];
  return channel === undefined
    ? `${parsed.origin}${parsed.pathname}${parsed.search}`
    : `${parsed.origin}${channel}`;
}

export interface PanelOwner {
  readonly tabId: number;
  readonly windowId: number;
  readonly pageKey: string | null;
}

export function isPanelOwner(value: unknown): value is PanelOwner {
  if (typeof value !== "object" || value === null) return false;
  const owner = value as Partial<PanelOwner>;
  return (
    typeof owner.tabId === "number" &&
    typeof owner.windowId === "number" &&
    (owner.pageKey === null || typeof owner.pageKey === "string")
  );
}

/**
 * パネルを開いたタブが更新されたとき、パネルを閉じるべきか。`url` は変化後の
 * URL（読めなければ undefined）、`loading` はページの読み込みが始まったか。
 */
export function hasLeftPanelPage(
  owner: PanelOwner,
  change: { readonly url?: string; readonly loading: boolean },
): boolean {
  if (change.url !== undefined)
    return panelPageKey(change.url) !== owner.pageKey;
  // URL を読めない読み込みは、権限のないサイトでの遷移か、権限のないサイトへ
  // 出ていく遷移。どちらもパネルを開いたページではなくなる。
  return change.loading;
}
