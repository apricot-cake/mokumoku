// YouTube の再生数表記（「55万回視聴」「1.2M views」など）を数値にする。
// 単位の綴りは `Intl.NumberFormat(locale, { notation: "compact" })` の出力から、
// 言語をまたいで桁が衝突しないものだけを載せている。
//
// 漢数字・ハングルの単位は、同じ体系を各言語の字で書いているだけなので
// 意味が言語で変わらない。ラテン文字は2文字以上の綴りを載せる。1文字の
// `B` と `M` はトルコ語・インドネシア語で桁が異なるが、ページの言語を読まない
// ので英語の読みに揃える。
const unitMultipliers: Readonly<Record<string, number>> = Object.freeze({
  K: 1000,
  M: 1000000,
  B: 1000000000,
  千: 1000,
  천: 1000,
  万: 10000,
  萬: 10000,
  만: 10000,
  億: 100000000,
  亿: 100000000,
  억: 100000000,
  MIL: 1000, // es・pt: mil
  MI: 1000000, // pt: mi
  BI: 1000000000, // pt-BR: bi
  "MIO.": 1000000, // de: Mio.
  "MRD.": 1000000000, // de: Mrd.
  MN: 1000000, // tr: Mn
  MR: 1000000000, // tr: Mr
  MLN: 1000000, // it: Mln
  MLD: 1000000000, // it: Mld
  "MLN.": 1000000,
  "MLD.": 1000000000,
  "TYS.": 1000, // pl: tys.
  RB: 1000, // id: rb
  JT: 1000000, // id: jt
  TR: 1000000, // vi: Tr
  MD: 1000000000, // fr: Md
});

// `T` はベトナム語では10億、デンマーク語では1,000で、桁を決められない。
const ambiguousUnits: ReadonlySet<string> = new Set(["T"]);

const unitPattern =
  "MIO\\.|MRD\\.|MLN\\.|MLD\\.|TYS\\.|MLN|MLD|MN|MR|MD|TR|MIL|MI|BI|RB|JT|" +
  "千|천|万|萬|만|億|亿|억|[KMBT]";

// 単位の直後にラテン文字が続くなら綴りの途中（`views` の `v` など）なので、
// 語境界を単位の候補の内側に置く。
const countPattern = new RegExp(
  `(\\d[\\d.,]*)\\s*((?:${unitPattern})(?![A-Za-z]))?`,
  "i",
);

export function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0),
  );
}

/** 数字を含まない表記（「No views」「視聴なし」）は 0、桁を決められない表記は NaN。 */
export function parseCount(value: string): number {
  const normalized = normalizeDigits(value).replace(/ /g, " ").trim();
  const match = normalized.match(countPattern);
  if (!match) {
    return 0;
  }
  const unit = match[2] ? match[2].toUpperCase() : "";
  let numericText = match[1] ?? "";
  numericText = unit
    ? numericText.replace(",", ".")
    : numericText.replace(/[,.]/g, "");
  const numericValue = Number.parseFloat(numericText);
  if (!Number.isFinite(numericValue) || ambiguousUnits.has(unit)) {
    return Number.NaN;
  }
  return Math.round(numericValue * (unitMultipliers[unit] ?? 1));
}
