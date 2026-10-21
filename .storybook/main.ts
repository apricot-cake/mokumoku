import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { generateChromeMessages, parseMessagesFile } from "@wxt-dev/i18n/build";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../stories/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: ["./public"],
  async viteFinal(config) {
    const messages = Object.fromEntries(
      await Promise.all(
        ["ja", "en"].map(async (locale) => [
          locale,
          generateChromeMessages(
            await parseMessagesFile(resolve(`locales/${locale}.yml`)),
          ),
        ]),
      ),
    );
    return mergeConfig(config, {
      plugins: [
        tailwindcss(),
        {
          name: "mokumoku-storybook-locales",
          resolveId(id) {
            if (id === "virtual:mokumoku-locales") return `\0${id}`;
          },
          load(id) {
            if (id === "\0virtual:mokumoku-locales")
              return `export default ${JSON.stringify(messages)}`;
          },
        },
      ],
      resolve: {
        // WXT の API は通常の Web ページでは使えない。表示は本体を使い、
        // 外部との境界だけを Storybook 内で差し替える。
        alias: [
          {
            find: /^\.\/use-(page-snapshot|loader|period)\.ts$/,
            replacement: resolve("stories/panel-environment.tsx"),
          },
          {
            find: /^\.\.\/\.\.\/utils\/i18n\.ts$/,
            replacement: resolve("stories/i18n.ts"),
          },
        ],
      },
    });
  },
};

export default config;
