import { browser } from "wxt/browser";

export const RELOAD_HOST_NAME = "io.github.apricot_cake.mokumoku.reload";
export const RELOAD_ATTEMPT_KEY = "mokumoku.localBuildReload.attempted";
export const CHECK_LOCAL_BUILD = "mokumoku:check-local-build";

export function buildToReload(
  message: unknown,
  ownBuild: string,
  attemptedBuild: unknown,
): string | null {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "build-available" ||
    !("build" in message) ||
    typeof message.build !== "string" ||
    message.build === "" ||
    message.build === ownBuild ||
    message.build === attemptedBuild
  ) {
    return null;
  }
  return message.build;
}

let pendingCheck: Promise<boolean> | null = null;
let reloadStarted = false;

export function checkLocalBuild(ownBuild: string): Promise<boolean> {
  if (reloadStarted) return Promise.resolve(false);
  if (pendingCheck) return pendingCheck;
  pendingCheck = queryLocalBuild(ownBuild).finally(() => {
    pendingCheck = null;
  });
  return pendingCheck;
}

async function queryLocalBuild(ownBuild: string): Promise<boolean> {
  try {
    const message: unknown = await browser.runtime.sendNativeMessage(
      RELOAD_HOST_NAME,
      { type: "get-build" },
    );
    const stored = await browser.storage.local.get(RELOAD_ATTEMPT_KEY);
    const build = buildToReload(message, ownBuild, stored[RELOAD_ATTEMPT_KEY]);
    if (!build) return true;

    // 同じスタンプでの試行は一度だけにし、出力先を取り違えた場合も
    // リロードを繰り返さない。操作の再開より先に記録・リロードする。
    await browser.storage.local.set({ [RELOAD_ATTEMPT_KEY]: build });
    // reload は即座に旧 context を破棄するとは限らない。その間の操作も止める。
    reloadStarted = true;
    browser.runtime.reload();
    return false;
  } catch {
    reloadStarted = false;
    // Host の未登録などで、拡張機能自体を使えなくしない。
    return true;
  }
}

export async function checkPanelBuild(): Promise<boolean> {
  if (!__MOKUMOKU_LOCAL_DEPLOY__) return true;
  try {
    return (
      (await browser.runtime.sendMessage({ type: CHECK_LOCAL_BUILD })) === true
    );
  } catch {
    // リロードで worker が終了した場合は、古いパネルの操作を進めない。
    return false;
  }
}
