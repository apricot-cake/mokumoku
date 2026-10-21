import "@fontsource-variable/noto-sans/wght.css";
import "@fontsource-variable/noto-sans-jp/wght.css";
import type { Preview } from "@storybook/react-vite";
import { HttpResponse, http } from "msw";
import { mswLoader } from "msw-storybook-addon/csf3";
import "../entrypoints/sidepanel/style.css";
import { setLocale } from "../stories/i18n.ts";

const preview: Preview = {
  loaders: [mswLoader()],
  initialGlobals: {
    locale: "ja",
    viewport: { value: "panel400", isRotated: false },
  },
  globalTypes: {
    locale: {
      description: "表示言語",
      toolbar: {
        icon: "globe",
        items: [
          { value: "ja", title: "日本語" },
          { value: "en", title: "English" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    msw: [
      http.get("https://i.ytimg.com/vi/:id/mqdefault.jpg", ({ params }) => {
        const number = String(params.id).replace("storybook-", "");
        // 架空の動画 ID への通信を止め、サンプルと分かるサムネイルを返す。
        return new HttpResponse(
          `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e2e8f0"/><text x="160" y="98" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#475569">SAMPLE ${number}</text></svg>`,
          { headers: { "Content-Type": "image/svg+xml" } },
        );
      }),
    ],
    viewport: {
      options: Object.fromEntries(
        [360, 400, 480].map((width) => [
          `panel${width}`,
          {
            name: `パネル ${width}px`,
            styles: { width: `${width}px`, height: "800px" },
          },
        ]),
      ),
    },
  },
  decorators: [
    (Story, context) => {
      setLocale(context.globals.locale);
      return <Story />;
    },
  ],
};

export default preview;
