import messages from "virtual:mokumoku-locales";
import type { t as translate } from "../utils/i18n.ts";

let locale = "ja";

export function setLocale(value: string) {
  locale = value;
}

// 本体と同じ WXT の変換で作ったメッセージを使う。使用中の $1～$9 と $$
// だけを展開し、キーの欠落は画面上のエラーにする。
export function t(
  key: Parameters<typeof translate>[0],
  substitutions?: string | readonly string[],
) {
  const entry = messages[locale]?.[key] ?? messages.en?.[key];
  if (!entry) throw new Error(`メッセージがありません: ${key}`);
  const args = Array.isArray(substitutions)
    ? substitutions
    : substitutions === undefined
      ? []
      : [substitutions];
  return entry.message.replace(/\$(\$|[1-9])/g, (_match, token: string) =>
    token === "$" ? "$" : String(args[Number(token) - 1] ?? ""),
  );
}
