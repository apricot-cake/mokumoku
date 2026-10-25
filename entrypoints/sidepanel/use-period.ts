import { useState } from "react";
import type { PeriodId } from "../../utils/period.ts";

export function usePeriod(): [PeriodId, (period: PeriodId) => void] {
  // 別タブへ隠した間は保持し、ページ移動・開き直しでは期間指定なしに戻る。
  return useState<PeriodId>("all");
}
