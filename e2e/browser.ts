import { createSession } from "./session.ts";
import { FIXTURE_URL, serveFixture } from "./youtube-fixture.ts";

export {
  choose,
  LABELS,
  RANGE,
  rows,
  settle,
  UNIT,
  waitRange,
} from "./session.ts";

export async function createApp() {
  let fixture: Awaited<ReturnType<typeof serveFixture>> | undefined;
  const session = await createSession({
    url: FIXTURE_URL,
    offline: true,
    resultsDirectory: ".output/e2e-results",
    prepare: async (page) => {
      fixture = await serveFixture(page);
    },
    diagnostics: () => ({ batchRequests: fixture?.requests }),
    beforeClose: () => fixture?.release(),
  });
  if (!fixture) throw new Error("固定データの準備に失敗しました。");
  return Object.assign(session, { fixture });
}

export type App = Awaited<ReturnType<typeof createApp>>;
