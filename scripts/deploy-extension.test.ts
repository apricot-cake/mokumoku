// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { promote } from "./deploy-extension.ts";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

test("ビルド結果で共有の出力を差し替え、作業用のフォルダを残さない", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mokumoku-deploy-"));
  directories.push(root);
  const built = path.join(root, "built");
  const destination = path.join(root, "deployed", "chrome-mv3");
  fs.mkdirSync(built);
  fs.writeFileSync(path.join(built, "manifest.json"), "new");
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "manifest.json"), "old");
  fs.writeFileSync(path.join(destination, "stale.js"), "");

  promote(built, destination);

  expect(fs.readFileSync(path.join(destination, "manifest.json"), "utf8")).toBe(
    "new",
  );
  expect(fs.existsSync(path.join(destination, "stale.js"))).toBe(false);
  expect(fs.readdirSync(path.dirname(destination))).toEqual(["chrome-mv3"]);
});
