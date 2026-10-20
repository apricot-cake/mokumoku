import { expect, it } from "vitest";
import { readLocaleMessages } from "../test/i18n.ts";

it("日本語と英語のメッセージは同じキーを持つ", async () => {
  const en = Object.keys(await readLocaleMessages("en")).sort();
  const ja = Object.keys(await readLocaleMessages("ja")).sort();
  expect(ja).toEqual(en);
});
