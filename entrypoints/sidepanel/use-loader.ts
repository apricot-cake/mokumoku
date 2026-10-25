import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { checkPanelBuild } from "../../utils/local-build-reload.ts";
import {
  isLoadMoreResult,
  LOAD_CANCEL_REQUEST,
  LOAD_MORE_REQUEST,
  type LoadMoreRequest,
  type LoadMoreResult,
} from "../../utils/snapshot.ts";

/** period は読み込み範囲まで続けて、more は1回分だけ読み込む。 */
export type LoadMode = "period" | "more";

export type LoadState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly mode: LoadMode }
  | {
      readonly kind: "done";
      readonly mode: LoadMode;
      readonly result: LoadMoreResult;
    };

/**
 * 表示中のタブに追加読み込みを頼む。読み込み中に別の読み込みを頼むと、
 * 前の読み込みを中止して終わるのを待ってから始める。増えた動画は
 * content script の更新通知で一覧に届く。
 */
export function useLoader(tabId: number) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const inflight = useRef<Promise<unknown> | null>(null);
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  const cancel = useCallback(() => {
    void browser.tabs
      .sendMessage(tabId, { type: LOAD_CANCEL_REQUEST })
      .catch(() => {});
  }, [tabId]);

  const run = useCallback(
    async (untilAgeMs: number | null) => {
      const signal = lifecycle.current?.signal;
      if (!signal || signal.aborted) return;
      if (inflight.current !== null) {
        cancel();
        await inflight.current;
        if (signal.aborted) return;
      }
      // ローカル配備ビルドでは、読み込みの前に新しいビルドを確かめる。新しい
      // ビルドがあれば拡張機能が読み込み直されてパネルが閉じるので、進めない。
      // ページ移動で画面が破棄された後は、確認待ちだった操作も開始しない。
      if (!(await checkPanelBuild()) || signal.aborted) return;
      const mode: LoadMode = untilAgeMs === null ? "more" : "period";
      const request: LoadMoreRequest =
        untilAgeMs === null
          ? { type: LOAD_MORE_REQUEST }
          : { type: LOAD_MORE_REQUEST, untilAgeMs };
      setState({ kind: "loading", mode });
      const sent = browser.tabs.sendMessage(tabId, request).catch(() => null);
      inflight.current = sent;
      const result = await sent;
      if (inflight.current === sent) inflight.current = null;
      if (signal.aborted) return;
      setState({
        kind: "done",
        mode,
        result: isLoadMoreResult(result) ? result : "timeout",
      });
    },
    [tabId, cancel],
  );

  return { state, run, cancel };
}
