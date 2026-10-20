// 画面の文字は locales/<言語>.yml にあり、どれを使うかはブラウザが決める。
// @wxt-dev/i18n の i18n.t() は browser.i18n.getMessage に型を足した薄いラッパー。
import { i18n } from "#i18n";

export const t = i18n.t;
