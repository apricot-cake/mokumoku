import { useEffect, useState } from "react";
import { storage } from "wxt/utils/storage";
import { isPeriodId, type PeriodId } from "../../utils/period.ts";

// 選んだ期間は次にパネルを開いたときも使う。
const periodItem = storage.defineItem<PeriodId>("local:period", {
  fallback: "all",
});

export function usePeriod(): [PeriodId, (period: PeriodId) => void] {
  const [period, setPeriod] = useState<PeriodId>("all");

  useEffect(() => {
    let active = true;
    void periodItem.getValue().then((value) => {
      if (active && isPeriodId(value)) setPeriod(value);
    });
    const unwatch = periodItem.watch((value) => {
      if (isPeriodId(value)) setPeriod(value);
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  return [
    period,
    (next) => {
      setPeriod(next);
      void periodItem.setValue(next);
    },
  ];
}
