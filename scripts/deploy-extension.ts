// メインのプロファイル向けに、現在のソースをビルドして共有の出力へ配備し、
// 自己リロード用のビルド ID を発行する。メインのプロファイルでは
// .output/deployed/chrome-mv3 を「パッケージ化されていない拡張機能」として
// 一度だけ読み込んでおく。以降は配備のたびに、パネルを開くか操作したときに
// 新しいビルドへ読み込み直される。
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertWindowsUserContext,
  installReloadHost,
  publishBuildStamp,
} from "../native-host/install.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, ".output");
const BUILT = path.join(OUTPUT_ROOT, "local", "chrome-mv3");
export const DEPLOYED = path.join(OUTPUT_ROOT, "deployed", "chrome-mv3");

function buildLocal(buildId: string): void {
  // .cmd のシェル解釈を避け、WXT の CLI を現在の Node で直接実行する。
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules", "wxt", "bin", "wxt.mjs"),
      "build",
      "-b",
      "chrome",
      "--mode",
      "production",
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        MOKUMOKU_BUILD_KIND: "local",
        MOKUMOKU_BUILD_ID: buildId,
      },
      stdio: "inherit",
    },
  );
}

/**
 * ビルド結果を共有の出力へ移す。Chrome が読み込み中のフォルダを途中の状態に
 * しないよう、隣にコピーしてから名前の付け替えで差し替える。
 */
export function promote(built: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(`${destination}-staging-`);
  const staged = path.join(staging, "next");
  const previous = path.join(staging, "previous");
  fs.cpSync(built, staged, { recursive: true, errorOnExist: true });
  const existed = fs.existsSync(destination);
  if (existed) fs.renameSync(destination, previous);
  try {
    fs.renameSync(staged, destination);
  } catch (error) {
    if (existed) fs.renameSync(previous, destination);
    throw error;
  }
  fs.rmSync(staging, { recursive: true, force: true });
}

function isMainWorkingTree(): boolean {
  try {
    return (
      fs.statSync(path.join(ROOT, ".git")).isDirectory() &&
      execSync("git branch --show-current", {
        cwd: ROOT,
        encoding: "utf8",
      }).trim() === "main"
    );
  } catch {
    return false;
  }
}

function main(): void {
  if (!isMainWorkingTree()) {
    console.log(
      "[mokumoku] main の主作業ツリーではないので配備を飛ばす（この出力を読むブラウザはない）",
    );
    return;
  }
  assertWindowsUserContext("pnpm run deploy:local");
  const buildId = randomUUID();
  buildLocal(buildId);
  promote(BUILT, DEPLOYED);
  installReloadHost();
  const stamp = publishBuildStamp(buildId, DEPLOYED);
  console.log(`[mokumoku] 現在のソースをビルドして配備した: ${DEPLOYED}`);
  console.log(
    `[mokumoku] 自己リロード用のビルド ID を発行した: ${buildId} (${stamp})`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
