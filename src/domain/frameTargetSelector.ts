/**
 * 打鍵近傍フレームの選択。
 *
 * オフライン解析は動画を 3 倍速で再生しながら推論するが、低スペック端末では
 * 推論 (150ms/frame 級) が提示レート (~48fps) に遠く及ばず、成り行きで 8 割以上の
 * フレームが捨てられていた。その結果「どの打鍵にも近くない」フレームで指を判定していた。
 *
 * ここでは各打鍵から「目標時刻」を作り、**目標時刻以降で最初に提示されたフレーム**だけを
 * 推論対象にする。呼び出し側 (infra) は、目標フレームなのに推論キューが埋まっている
 * ときはフレームを捨てず video を一時停止して待つ。これで「速いが精度が壊れている」
 * 状態から「打鍵ごとに自分のフレームが必ず付く」状態へ変える。
 *
 * 純関数・純クラスのみ。DOM も MediaPipe も知らない。
 */

export interface FrameTargetSelectorOptions {
  /**
   * 各打鍵時刻に加えるオフセット (ms)。要素数 = 打鍵あたりの推論フレーム数 F。
   * `[0]` なら keydown 以降の最初のフレーム 1 枚。前寄りに見たいなら `[-120, -40, 0]` など。
   */
  offsetsMs: number[];
  /**
   * 目標時刻からこれ以上遅れたフレームは、もはやその打鍵の判定に使えないとみなして
   * 推論せずに目標を諦める (ms)。TypingSession.findNearestFrame の許容 (500ms) と合わせる。
   */
  maxLagMs: number;
  /**
   * 目標時刻からこれ以上遅れたフレームは「遅延あり」として数える (ms)。
   * 既存セッションの実測で、150ms 以内なら判定結果が変わらないことを確認している。
   */
  lateThresholdMs: number;
}

export interface FrameTargetStats {
  /** 生成した目標時刻の総数 (= 打鍵数 × offsetsMs.length)。 */
  total: number;
  /** フレームを割り当てて推論に回した目標数。 */
  captured: number;
  /** 割り当てたフレームが lateThresholdMs より遅れていた目標数 (captured の内数)。 */
  late: number;
  /** maxLagMs を超えて遅れたため諦めた目標数。 */
  abandoned: number;
  /** 動画終了までに一度も到達しなかった目標数 (video より後の打鍵など)。 */
  unreached: number;
}

export interface FrameTargetSelector {
  /**
   * 提示されたフレーム時刻 (動画時間 ms) を推論したいか。副作用なし。
   * 一時停止 → 再開で同じフレームを問い直しても同じ答えを返す。
   */
  wants(frameTimeMs: number): boolean;
  /**
   * そのフレームを推論に回すと確定したときに呼ぶ。
   * このフレームで満たされる目標 (frameTimeMs 以前のもの) をすべて消費する。
   */
  markCaptured(frameTimeMs: number): void;
  /** 動画終了時に呼び、未到達の目標を確定させて統計を返す。 */
  finish(): FrameTargetStats;
  stats(): FrameTargetStats;
  targetCount(): number;
}

export const DEFAULT_FRAME_TARGET_OPTIONS: FrameTargetSelectorOptions = {
  offsetsMs: [0],
  maxLagMs: 500,
  lateThresholdMs: 150,
};

/**
 * 打鍵時刻とオフセットから、昇順の目標時刻列を作る。
 * 打鍵が未ソートでも構わない。
 */
export function buildFrameTargets(keystrokeTimesMs: number[], offsetsMs: number[]): number[] {
  const targets: number[] = [];
  for (const t of keystrokeTimesMs) {
    if (!Number.isFinite(t)) continue;
    for (const offset of offsetsMs) targets.push(t + offset);
  }
  return targets.sort((a, b) => a - b);
}

export function createFrameTargetSelector(
  keystrokeTimesMs: number[],
  options: FrameTargetSelectorOptions = DEFAULT_FRAME_TARGET_OPTIONS
): FrameTargetSelector {
  const targets = buildFrameTargets(keystrokeTimesMs, options.offsetsMs);
  const { maxLagMs, lateThresholdMs } = options;

  // targets[next] が「まだ満たされていない最初の目標」。
  let next = 0;
  const stats: FrameTargetStats = {
    total: targets.length,
    captured: 0,
    late: 0,
    abandoned: 0,
    unreached: 0,
  };

  // maxLagMs を超えて過ぎ去った目標を諦めて読み飛ばす。
  // wants() からも呼ぶが、統計の更新以外に状態を持たないので副作用は「諦め」の確定だけ。
  const abandonStale = (frameTimeMs: number) => {
    while (next < targets.length && frameTimeMs - targets[next] > maxLagMs) {
      stats.abandoned++;
      next++;
    }
  };

  return {
    wants(frameTimeMs) {
      abandonStale(frameTimeMs);
      return next < targets.length && frameTimeMs >= targets[next];
    },

    markCaptured(frameTimeMs) {
      abandonStale(frameTimeMs);
      // このフレームは frameTimeMs 以前のすべての未消費目標を満たす。
      // (打鍵が提示間隔より密なとき、1 フレームが複数の打鍵を担うのは正しい。)
      let satisfied = 0;
      let lateCount = 0;
      while (next < targets.length && targets[next] <= frameTimeMs) {
        if (frameTimeMs - targets[next] > lateThresholdMs) lateCount++;
        satisfied++;
        next++;
      }
      stats.captured += satisfied;
      stats.late += lateCount;
    },

    finish() {
      stats.unreached += targets.length - next;
      next = targets.length;
      return { ...stats };
    },

    stats: () => ({ ...stats }),
    targetCount: () => targets.length,
  };
}
