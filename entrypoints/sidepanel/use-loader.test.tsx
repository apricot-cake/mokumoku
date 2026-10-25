import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { checkPanelBuild } from "../../utils/local-build-reload.ts";
import { LOAD_MORE_REQUEST } from "../../utils/snapshot.ts";
import { useLoader } from "./use-loader.ts";

vi.mock("../../utils/local-build-reload.ts", () => ({
  checkPanelBuild: vi.fn(() => Promise.resolve(true)),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLElement;

function View() {
  const { run, state } = useLoader(1);
  return (
    <button type="button" onClick={() => void run(1000)}>
      {state.kind}
    </button>
  );
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(checkPanelBuild).mockReset().mockResolvedValue(true);
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation((() =>
    Promise.resolve("reached")) as typeof fakeBrowser.tabs.sendMessage);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

it("ビルド確認待ちでページを往復しても、旧ページの操作を開始しない", async () => {
  const check = Promise.withResolvers<boolean>();
  vi.mocked(checkPanelBuild).mockReturnValueOnce(check.promise);
  await act(async () => root.render(<View key="videos-1" />));
  await act(async () => container.querySelector("button")?.click());
  expect(checkPanelBuild).toHaveBeenCalledOnce();
  await act(async () => root.render(<View key="streams" />));
  await act(async () => root.render(<View key="videos-2" />));
  await act(async () => check.resolve(true));
  expect(fakeBrowser.tabs.sendMessage).not.toHaveBeenCalled();
  expect(container.textContent).toBe("idle");

  // 戻ったページで新しく選んだ操作は実行できる。
  await act(async () => container.querySelector("button")?.click());
  expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(1, {
    type: LOAD_MORE_REQUEST,
    untilAgeMs: 1000,
  });
});

it("前の読み込みの終了を待つ操作も、ページ移動後には始めない", async () => {
  const loaded = Promise.withResolvers<unknown>();
  vi.mocked(fakeBrowser.tabs.sendMessage).mockImplementationOnce(
    () => loaded.promise,
  );
  await act(async () => root.render(<View key="videos" />));
  await act(async () => container.querySelector("button")?.click());
  await act(async () => container.querySelector("button")?.click());
  await act(async () => root.render(<View key="streams" />));
  await act(async () => loaded.resolve("cancelled"));
  const loadRequests = vi
    .mocked(fakeBrowser.tabs.sendMessage)
    .mock.calls.filter(
      ([, message]) =>
        (message as { type?: unknown }).type === LOAD_MORE_REQUEST,
    );
  expect(loadRequests).toHaveLength(1);
  expect(checkPanelBuild).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("idle");
});
