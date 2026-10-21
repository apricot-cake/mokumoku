// 手動確認には、自動検証と同じプロファイルを CDP ポートなしで開く。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  assertDevBrowserProfile,
  secureDevBrowserProfile,
} from "./dev-browser-profile.ts";
import { devBrowserProfile } from "./managed-dev-browser.ts";

const profile = devBrowserProfile();
const args = process.argv.slice(2);
if (
  args.length > 1 ||
  (args[0] && args[0] !== "--print" && args[0] !== "--dev")
)
  throw new Error("利用できる引数は --print か --dev だけです。");
// --dev は開発サーバーの出力を読み込み、変更のたびに自動で再読み込みさせる。
const dev = args[0] === "--dev";
if (args[0] === "--print") {
  assertDevBrowserProfile(profile);
  console.log(`プロファイル: ${profile}`);
  console.log("ブラウザ接続: 起動元の内部 pipe（TCP 待受なし）");
} else {
  secureDevBrowserProfile(profile);
  const log = fs.openSync(path.join(profile, "chrome-stderr.log"), "a");
  try {
    const child = spawn(
      process.execPath,
      [
        path.join(import.meta.dirname, "manual-dev-browser.ts"),
        ...(dev ? ["--dev"] : []),
      ],
      {
        detached: true,
        stdio: ["ignore", log, log, "ipc"],
        windowsHide: true,
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("message", (message) => {
        if (message === "ready") resolve();
        else reject(new Error("手動確認用 Chrome の起動応答が不正です。"));
      });
      child.once("error", reject);
      child.once("exit", () =>
        reject(
          new Error(
            dev
              ? "手動確認用 Chrome を起動できません。開発用 Chrome を閉じ、pnpm dev の実行中に再実行してください。"
              : "手動確認用 Chrome を起動できません。開発用 Chrome を閉じ、pnpm run build を実行してから再実行してください。",
          ),
        ),
      );
    });
    child.disconnect();
    child.unref();
  } finally {
    fs.closeSync(log);
  }
  console.log(
    `[mokumoku] 手動確認用 Chrome を CDP ポートなしで開いた: ${profile}`,
  );
}
