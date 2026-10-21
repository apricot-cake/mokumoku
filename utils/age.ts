import { normalizeDigits } from "./count.ts";

export const AGE_UNIT_MS = Object.freeze({
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30.4375 * 24 * 60 * 60 * 1000,
  year: 365.25 * 24 * 60 * 60 * 1000,
});

type Unit = keyof typeof AGE_UNIT_MS;

interface AgePattern {
  readonly pattern: RegExp;
  readonly units: Readonly<Record<string, Unit>>;
}

const PORTUGUESE_SPANISH_UNITS: Readonly<Record<string, Unit>> = {
  segundo: "second",
  segundos: "second",
  minuto: "minute",
  minutos: "minute",
  hora: "hour",
  horas: "hour",
  dia: "day",
  dias: "day",
  día: "day",
  días: "day",
  semana: "week",
  semanas: "week",
  mes: "month",
  meses: "month",
  ano: "year",
  anos: "year",
  año: "year",
  años: "year",
};

// YouTube が一覧に出す相対表記（「16 時間前」「2 weeks ago」など）。
// 「2 日前に配信済み」のような前後の語は無視して、数と単位だけを読む。
const AGE_PATTERNS: readonly AgePattern[] = [
  {
    pattern:
      /(\d+(?:[.,]\d+)?)\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago/i,
    units: {
      second: "second",
      seconds: "second",
      minute: "minute",
      minutes: "minute",
      hour: "hour",
      hours: "hour",
      day: "day",
      days: "day",
      week: "week",
      weeks: "week",
      month: "month",
      months: "month",
      year: "year",
      years: "year",
    },
  },
  {
    pattern:
      /(\d+(?:[.,]\d+)?)\s*(秒|分|時間|小時|小时|日|天|週間|週|周|か月|ヶ月|個月|个月|月|年)\s*前/,
    units: {
      秒: "second",
      分: "minute",
      時間: "hour",
      小時: "hour",
      小时: "hour",
      日: "day",
      天: "day",
      週間: "week",
      週: "week",
      周: "week",
      か月: "month",
      ヶ月: "month",
      個月: "month",
      个月: "month",
      月: "month",
      年: "year",
    },
  },
  {
    pattern: /(\d+(?:[.,]\d+)?)\s*(초|분|시간|일|주|개월|년)\s*전/,
    units: {
      초: "second",
      분: "minute",
      시간: "hour",
      일: "day",
      주: "week",
      개월: "month",
      년: "year",
    },
  },
  {
    pattern:
      /hace\s+(\d+(?:[.,]\d+)?)\s*(segundos?|minutos?|horas?|d[ií]as?|semanas?|meses?|a[ñn]os?)/i,
    units: PORTUGUESE_SPANISH_UNITS,
  },
  {
    pattern:
      /h[aá]\s+(\d+(?:[.,]\d+)?)\s*(segundos?|minutos?|horas?|dias?|semanas?|meses?|anos?)/i,
    units: PORTUGUESE_SPANISH_UNITS,
  },
];

/** 公開からの経過時間（ミリ秒）。相対表記として読めなければ NaN。 */
export function parseAge(value: string): number {
  const text = normalizeDigits(value).trim();
  for (const { pattern, units } of AGE_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1] || !match[2]) continue;
    const amount = Number.parseFloat(match[1].replace(",", "."));
    const unit = units[match[2].toLowerCase()];
    if (Number.isFinite(amount) && unit !== undefined) {
      return amount * AGE_UNIT_MS[unit];
    }
  }
  return Number.NaN;
}
