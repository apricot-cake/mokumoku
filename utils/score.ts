// 各動画の再生数を、同じチャンネルの「同じ経過時間での通常の再生数」と比べる。
//
// 一覧から読めるのは現在の累積再生数と経過時間だけなので、読み込み済みの
// 動画から log(再生数) = a + b·log(経過日数) を当てはめ、その期待値に対する
// 倍率を出す。当てはめには外れ値に強い Theil–Sen 推定を使う。伸びた動画
// そのものが基準を引き上げないようにするため。

export interface VideoSample {
  readonly views: number;
  readonly ageMs: number;
}

export interface Baseline {
  readonly intercept: number;
  readonly slope: number;
  readonly sampleCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 当てはめに必要な動画数。これ未満では基準を出さない。 */
export const MIN_BASELINE_SAMPLES = 8;
/** 公開からこれ未満の動画は値のぶれが大きいので、基準と一覧の対象から外す。 */
export const PROVISIONAL_AGE_MS = DAY_MS;
/** 基準に使う動画数の上限。新しい順に数え、チャンネルの規模の変化を追う。 */
export const BASELINE_WINDOW = 200;
// 経過日数の幅がこれ（倍）未満だと、傾きを決められない。
const MIN_AGE_SPREAD = 3;

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 === 1
    ? (values[middle] as number)
    : ((values[middle - 1] as number) + (values[middle] as number)) / 2;
}

function logAgeDays(ageMs: number): number {
  return Math.log(Math.max(ageMs, PROVISIONAL_AGE_MS / 24) / DAY_MS);
}

export function fitBaseline(videos: readonly VideoSample[]): Baseline | null {
  const points = videos
    .filter(
      (video) =>
        Number.isFinite(video.views) &&
        video.views > 0 &&
        Number.isFinite(video.ageMs) &&
        video.ageMs >= PROVISIONAL_AGE_MS,
    )
    .sort((a, b) => a.ageMs - b.ageMs)
    .slice(0, BASELINE_WINDOW)
    .map((video) => ({ x: logAgeDays(video.ageMs), y: Math.log(video.views) }));

  if (points.length < MIN_BASELINE_SAMPLES) return null;
  const xs = points.map((point) => point.x);
  if (Math.max(...xs) - Math.min(...xs) < Math.log(MIN_AGE_SPREAD)) return null;

  const slopes: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as { x: number; y: number };
    for (let j = i + 1; j < points.length; j += 1) {
      const b = points[j] as { x: number; y: number };
      if (b.x !== a.x) slopes.push((b.y - a.y) / (b.x - a.x));
    }
  }
  // 1本の動画の累積再生数は減らないので、負の傾きは「昔はチャンネルが
  // 小さかった」ことの表れで、経過時間による伸びではない。0で止める。
  const slope = Math.max(0, median(slopes));
  const intercept = median(points.map((point) => point.y - slope * point.x));
  return { intercept, slope, sampleCount: points.length };
}

export function expectedViews(baseline: Baseline, ageMs: number): number {
  return Math.exp(baseline.intercept + baseline.slope * logAgeDays(ageMs));
}

/** 期待値に対する倍率。再生数か経過時間を読めない動画は null。 */
export function viewRatio(
  baseline: Baseline,
  video: VideoSample,
): number | null {
  if (
    !Number.isFinite(video.views) ||
    video.views < 0 ||
    !Number.isFinite(video.ageMs)
  )
    return null;
  return video.views / expectedViews(baseline, video.ageMs);
}

export function isProvisional(video: VideoSample): boolean {
  return video.ageMs < PROVISIONAL_AGE_MS;
}
