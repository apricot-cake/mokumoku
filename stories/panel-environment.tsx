import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { LoadState } from "../entrypoints/sidepanel/use-loader.ts";
import type { PageState } from "../entrypoints/sidepanel/use-page-snapshot.ts";
import type { PeriodId } from "../utils/period.ts";
import { moreVideos } from "./fixtures.ts";

export interface PanelScenario {
  page: PageState | null | undefined;
  period: PeriodId;
  loadState: LoadState;
}

interface PanelEnvironment extends PanelScenario {
  setPeriod: (period: PeriodId) => void;
  run: (untilAgeMs: number | null) => Promise<void>;
  cancel: () => void;
}

const Environment = createContext<PanelEnvironment | null>(null);

export function PanelProvider({
  scenario,
  children,
}: {
  scenario: PanelScenario;
  children: ReactNode;
}) {
  const [page, setPage] = useState(scenario.page);
  const [period, setPeriod] = useState(scenario.period);
  const [loadState, setLoadState] = useState(scenario.loadState);
  // 操作時に固定サンプルを追加する。YouTube や拡張機能には接続しない。
  const run = useCallback(async (untilAgeMs: number | null) => {
    setPage((current) => {
      if (current?.snapshot.kind !== "ready") return current;
      const existing = new Set(
        current.snapshot.videos.map((video) => video.id),
      );
      return {
        ...current,
        snapshot: {
          ...current.snapshot,
          videos: [
            ...current.snapshot.videos,
            ...moreVideos.filter((video) => !existing.has(video.id)),
          ],
          canLoadMore: false,
        },
      };
    });
    setLoadState({
      kind: "done",
      mode: untilAgeMs === null ? "more" : "period",
      result: "end",
    });
  }, []);
  const cancel = useCallback(() => {
    setLoadState({ kind: "done", mode: "period", result: "cancelled" });
  }, []);
  const value = useMemo(
    () => ({ page, period, loadState, setPeriod, run, cancel }),
    [page, period, loadState, run, cancel],
  );
  return <Environment value={value}>{children}</Environment>;
}

function useEnvironment() {
  const environment = useContext(Environment);
  if (!environment) throw new Error("PanelProvider が必要です。");
  return environment;
}

export function usePageSnapshot() {
  return useEnvironment().page;
}

export function usePeriod(): [PeriodId, (period: PeriodId) => void] {
  const { period, setPeriod } = useEnvironment();
  return [period, setPeriod];
}

export function useLoader() {
  const { loadState, run, cancel } = useEnvironment();
  return { state: loadState, run, cancel };
}
