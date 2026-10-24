import { mkdir, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { join, resolve } from "node:path";

// 本体とStorybookのロジック・架空サンプルを静的デモでも使う。
const root = resolve(import.meta.dirname, "..");
const output = join(root, "website", "generated");
await mkdir(output, { recursive: true });
for (const [source, target] of [
  ["utils/score.ts", "score.js"],
  ["utils/ranking.ts", "ranking.js"],
  ["stories/fixtures.ts", "samples.js"],
] as const) {
  const content = await readFile(join(root, source), "utf8");
  const javascript = stripTypeScriptTypes(content).replace(
    'from "./score.ts"',
    'from "./score.js"',
  );
  await writeFile(join(output, target), javascript);
}
