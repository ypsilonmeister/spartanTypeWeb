/**
 * セッション終了後の解析パイプライン (デコード → MediaPipe 推論 → 座標変換 → 集計)
 * を段階ごとに計測するためのプロファイラ。
 *
 * `VITE_ANALYSIS_PROFILE=1` を付けて dev サーバ / ビルドを起動したときだけ有効になる。
 * フラグが無いときは `isAnalysisProfilingEnabled` がビルド時に定数 false へ畳み込まれ、
 * 呼び出し側には即 return するだけの no-op プロファイラが渡る (本番の挙動は不変)。
 *
 * メインスレッドと Worker の両方から import される。
 */

const PROFILE_FLAG = import.meta.env.VITE_ANALYSIS_PROFILE;

export const isAnalysisProfilingEnabled =
  PROFILE_FLAG === '1' || PROFILE_FLAG === 'true';

/**
 * 最後の計測結果を保存する localStorage キー。
 * USB デバッグできない端末でもコンソールを見ずに回収できるよう、
 * 同一オリジンの probe.html がこのキーを読んで表示・共有する。
 */
export const ANALYSIS_PROFILE_STORAGE_KEY = 'spartan.analysisProfile.last';

export interface StoredAnalysisProfile {
  title: string;
  savedAt: string;
  wallMs: number;
  notes: Record<string, string | number>;
  counters: Record<string, number>;
  timings: Record<string, { totalMs: number; calls: number }>;
}

export interface AnalysisProfiler {
  readonly enabled: boolean;
  /** カウンタを加算する (フレーム数など)。 */
  count(name: string, delta?: number): void;
  /** 計測済みのミリ秒を該当バケットへ加算する。 */
  add(name: string, ms: number): void;
  /** 非同期区間の計測。返された関数を呼んだ時点までが加算される。 */
  span(name: string): () => void;
  /** 同期処理を計測しつつ実行する。 */
  measure<T>(name: string, fn: () => T): T;
  /** 数値/文字列のメタ情報を記録する (解像度・デリゲート・セッション長など)。 */
  note(name: string, value: string | number): void;
  /** 集計結果をコンソールへ出力する。 */
  report(title: string): void;
}

const noopSpan = () => {};

const disabledProfiler: AnalysisProfiler = {
  enabled: false,
  count: () => {},
  add: () => {},
  span: () => noopSpan,
  measure: (_name, fn) => fn(),
  note: () => {},
  report: () => {},
};

interface TimingBucket {
  totalMs: number;
  calls: number;
}

class EnabledAnalysisProfiler implements AnalysisProfiler {
  public readonly enabled = true;

  private readonly startedAt = performance.now();
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<string, TimingBucket>();
  private readonly notes = new Map<string, string | number>();

  public count(name: string, delta = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  public add(name: string, ms: number) {
    const bucket = this.timings.get(name) ?? { totalMs: 0, calls: 0 };
    bucket.totalMs += ms;
    bucket.calls += 1;
    this.timings.set(name, bucket);
  }

  public span(name: string) {
    const start = performance.now();
    return () => this.add(name, performance.now() - start);
  }

  public measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.add(name, performance.now() - start);
    }
  }

  public note(name: string, value: string | number) {
    this.notes.set(name, value);
  }

  public report(title: string) {
    const wallMs = performance.now() - this.startedAt;

    const timingRows = [...this.timings.entries()].map(([bucket, { totalMs, calls }]) => ({
      bucket,
      totalMs: Number(totalMs.toFixed(1)),
      calls,
      avgMs: calls > 0 ? Number((totalMs / calls).toFixed(2)) : 0,
      pctOfWall: Number(((totalMs / wallMs) * 100).toFixed(1)),
    }));

    const counterRows = [...this.counters.entries()].map(([counter, value]) => ({
      counter,
      value,
    }));

    const noteRows = [...this.notes.entries()].map(([note, value]) => ({ note, value }));

    console.groupCollapsed(
      `[AnalysisProfile] ${title} — wall ${wallMs.toFixed(0)}ms`
    );
    console.table(noteRows);
    console.table(counterRows);
    console.table(timingRows);
    const stored: StoredAnalysisProfile = {
      title,
      savedAt: new Date().toISOString(),
      wallMs: Number(wallMs.toFixed(1)),
      notes: Object.fromEntries(this.notes),
      counters: Object.fromEntries(this.counters),
      timings: Object.fromEntries(
        timingRows.map((row) => [row.bucket, { totalMs: row.totalMs, calls: row.calls }])
      ),
    };
    const json = JSON.stringify(stored);
    console.log('[AnalysisProfile] JSON', json);
    console.groupEnd();

    // report() はメインスレッドからしか呼ばれないが、このモジュールは Worker にも
    // import されるため localStorage の有無は必ず確認する。
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ANALYSIS_PROFILE_STORAGE_KEY, json);
      }
    } catch (err) {
      console.warn('[AnalysisProfile] could not persist the report:', err);
    }
  }
}

/**
 * プロファイラを生成する。計測が無効なときは共有の no-op を返すため、
 * 呼び出し側は分岐せずにそのまま計測コードを書ける。
 */
export function createAnalysisProfiler(): AnalysisProfiler {
  return isAnalysisProfilingEnabled ? new EnabledAnalysisProfiler() : disabledProfiler;
}

export { disabledProfiler as noopAnalysisProfiler };
