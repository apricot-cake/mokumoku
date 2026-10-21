// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import type { Browser } from "puppeteer-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extensionOutput, loadExtension } from "./managed-dev-browser.ts";

const EXTENSION_ID = "development-extension";

/** 同じパスの再読み込みだけでは、既存 worker と有効状態が残る Chrome を再現する。 */
function installedBrowser(enabled: boolean) {
  let installed: { enabled: boolean; source: string } | null = {
    enabled,
    source: "previous-background",
  };
  const calls: [string, string][] = [];
  const installExtension = vi.fn(async (output: string) => {
    calls.push(["install", output]);
    installed ??= { enabled: true, source: "current-background" };
    return EXTENSION_ID;
  });
  const uninstallExtension = vi.fn(async (id: string) => {
    calls.push(["uninstall", id]);
    installed = null;
  });
  return {
    browser: { installExtension, uninstallExtension } as unknown as Browser,
    installExtension,
    uninstallExtension,
    calls,
    state: () => installed,
  };
}

beforeEach(() => {
  vi.spyOn(fs, "existsSync").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("開発用拡張機能の読み込み", () => {
  it.each([true, false])(
    "既存拡張機能の有効状態が %s でも、外してから現行 worker を読み込む",
    async (enabled) => {
      const fixture = installedBrowser(enabled);
      const output = extensionOutput(false);
      const id = await loadExtension(fixture.browser);
      expect(id).toBe(EXTENSION_ID);
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(output, "manifest.json"),
      );
      expect(fixture.calls).toEqual([
        ["install", output],
        ["uninstall", EXTENSION_ID],
        ["install", output],
      ]);
      expect(fixture.state()).toEqual({
        enabled: true,
        source: "current-background",
      });
    },
  );

  it("開発サーバーの出力も、外してから同じパスを読み込み直す", async () => {
    const fixture = installedBrowser(true);
    const output = extensionOutput(true);
    await loadExtension(fixture.browser, true);
    expect(fixture.calls).toEqual([
      ["install", output],
      ["uninstall", EXTENSION_ID],
      ["install", output],
    ]);
  });

  it("既存拡張機能を外せなければ、再読み込みを続けない", async () => {
    const fixture = installedBrowser(true);
    fixture.uninstallExtension.mockRejectedValueOnce(
      new Error("アンインストール失敗"),
    );
    await expect(loadExtension(fixture.browser)).rejects.toThrow(
      "アンインストール失敗",
    );
    expect(fixture.installExtension).toHaveBeenCalledTimes(1);
  });

  it("ビルドがなければ、既存拡張機能を操作しない", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const fixture = installedBrowser(true);
    await expect(loadExtension(fixture.browser)).rejects.toThrow(
      "先に pnpm run build",
    );
    expect(fixture.calls).toEqual([]);
  });
});
