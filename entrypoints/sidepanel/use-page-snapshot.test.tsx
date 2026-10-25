import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { usePageSnapshot } from "./use-page-snapshot.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLElement;
function View() {
  const state = usePageSnapshot();
  return (
    <div>
      {state
        ? `${state.tabId}:${state.snapshot.kind === "not-newest" ? state.snapshot.channel : state.snapshot.kind}`
        : "empty"}
    </div>
  );
}
beforeEach(() => {
  fakeBrowser.reset();
  window.history.replaceState({}, "", "/?tabId=10");
  container = document.createElement("div");
  root = createRoot(container);
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((() =>
    Promise.resolve([
      { id: 11 } as Browser.tabs.Tab,
    ])) as typeof fakeBrowser.tabs.query);
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation((() =>
    Promise.resolve({
      kind: "not-newest",
      channel: "元チャンネル",
    })) as typeof fakeBrowser.tabs.sendMessage);
});
afterEach(async () => {
  await act(async () => root.unmount());
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  fakeBrowser.reset();
});
it("非表示中もパネルの元タブを読み、別タブの切替と更新通知では内容を変えない", async () => {
  await act(async () => root.render(<View />));
  expect(container.textContent).toBe("10:元チャンネル");
  expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(10, {
    type: "mokumoku:snapshot-request",
  });
  expect(fakeBrowser.tabs.query).not.toHaveBeenCalled();
  vi.mocked(fakeBrowser.tabs.sendMessage).mockClear();
  await act(async () => {
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 11, windowId: 2 });
    await fakeBrowser.runtime.onMessage.trigger(
      {
        type: "mokumoku:snapshot",
        snapshot: { kind: "not-newest", channel: "別チャンネル" },
      },
      { tab: { id: 11 } as Browser.tabs.Tab },
      () => {},
    );
    await fakeBrowser.tabs.onUpdated.trigger(11, { status: "complete" }, {
      id: 11,
    } as Browser.tabs.Tab);
  });
  expect(container.textContent).toBe("10:元チャンネル");
  expect(fakeBrowser.tabs.sendMessage).not.toHaveBeenCalled();
  await act(async () =>
    fakeBrowser.runtime.onMessage.trigger(
      {
        type: "mokumoku:snapshot",
        snapshot: { kind: "not-newest", channel: "元タブ更新" },
      },
      { tab: { id: 10 } as Browser.tabs.Tab },
      () => {},
    ),
  );
  expect(container.textContent).toBe("10:元タブ更新");
});
it("元タブの読み込み完了では同じタブへ再問い合わせする", async () => {
  await act(async () => root.render(<View />));
  vi.mocked(fakeBrowser.tabs.sendMessage).mockClear();
  await act(async () =>
    fakeBrowser.tabs.onUpdated.trigger(10, { status: "complete" }, {
      id: 10,
    } as Browser.tabs.Tab),
  );
  expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(10, {
    type: "mokumoku:snapshot-request",
  });
});
