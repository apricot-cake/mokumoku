// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readSavedTabs, restorableUrls, saveTabs } from "./dev-browser-tabs.ts";

describe("手動確認用 Chrome のタブの記録", () => {
  const directories: string[] = [];
  const temporary = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mokumoku-tabs-"));
    directories.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of directories.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  test("ウェブページだけを開き直す対象にする", () => {
    expect(
      restorableUrls([
        "https://www.youtube.com/@GoogleJapan/videos",
        "chrome://new-tab-page/",
        "chrome-extension://abc/sidepanel.html",
        "about:blank",
        "http://localhost:3000/",
      ]),
    ).toEqual([
      "https://www.youtube.com/@GoogleJapan/videos",
      "http://localhost:3000/",
    ]);
  });

  test("記録したタブを読み出す", () => {
    const profile = temporary();
    saveTabs(profile, ["https://example.com/", "chrome://new-tab-page/"]);
    expect(readSavedTabs(profile)).toEqual(["https://example.com/"]);
  });

  test("開き直す対象がなければ前回の記録を残す", () => {
    const profile = temporary();
    saveTabs(profile, ["https://example.com/"]);
    saveTabs(profile, ["chrome://new-tab-page/"]);
    expect(readSavedTabs(profile)).toEqual(["https://example.com/"]);
  });

  test("記録がない・壊れているときは空", () => {
    const profile = temporary();
    expect(readSavedTabs(profile)).toEqual([]);
    fs.writeFileSync(path.join(profile, "mokumoku-tabs.json"), "{");
    expect(readSavedTabs(profile)).toEqual([]);
  });
});
