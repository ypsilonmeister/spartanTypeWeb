/**
 * dev 専用デバイスプローブの、メインスレッド ⇄ プローブワーカー間プロトコル。
 *
 * 本番の workerProtocol.ts とは意図的に分離してある (本番の型を汚さないため)。
 * WASM の機能検出だけは双方から使うのでここに置く。
 */

export interface ProbeContextRequest {
  type: 'CONTEXT';
}

export interface ProbeInitRequest {
  type: 'INIT';
  delegate: 'GPU' | 'CPU';
}

export interface ProbeBenchRequest {
  type: 'BENCH';
  /** 推論にかける画像。ワーカー側で close する。 */
  image: ImageBitmap;
  iterations: number;
  /** 結果表示用のラベル (例: "960x540")。 */
  label: string;
}

export interface ProbeDisposeRequest {
  type: 'DISPOSE';
}

export type ProbeRequest =
  | ProbeContextRequest
  | ProbeInitRequest
  | ProbeBenchRequest
  | ProbeDisposeRequest;

/** ワーカーコンテキストで何が使えるか。GPU デリゲートの可否を左右する。 */
export interface ProbeContextResult {
  type: 'CONTEXT_RESULT';
  offscreenCanvas: boolean;
  webgl1: boolean;
  webgl2: boolean;
  /** WEBGL_debug_renderer_info が取れた場合の GPU 名。SoC 特定に使える。 */
  renderer: string | null;
  vendor: string | null;
  maxTextureSize: number | null;
  wasmSimd: boolean;
  wasmThreads: boolean;
  hardwareConcurrency: number;
}

export interface ProbeInitResult {
  type: 'INIT_RESULT';
  delegate: 'GPU' | 'CPU';
  ok: boolean;
  /** createFromOptions に掛かった時間 (ms)。失敗時は失敗までの時間。 */
  ms: number;
  error?: string;
}

export interface ProbeBenchResult {
  type: 'BENCH_RESULT';
  label: string;
  iterations: number;
  /** 1 回目 (トラッキング未確立、palm detection が走る) の時間。 */
  firstMs: number;
  /** 2 回目以降の平均。VIDEO モードのトラッキングが効いた定常状態。 */
  steadyAvgMs: number;
  minMs: number;
  maxMs: number;
  /** 最後の推論で検出された手の数。0 なら landmark モデルが走っておらず過小評価。 */
  handsDetected: number;
}

export interface ProbeError {
  type: 'PROBE_ERROR';
  error: string;
}

export type ProbeResponse =
  | ProbeContextResult
  | ProbeInitResult
  | ProbeBenchResult
  | ProbeError;

/**
 * WASM SIMD の機能検出。wasm-feature-detect と同じ最小モジュールを validate する。
 * MediaPipe の CPU デリゲートはこれが無いと数倍遅くなるので、最重要の判定項目。
 */
export function detectWasmSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00,
      0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
    ]));
  } catch {
    return false;
  }
}

/**
 * WASM threads の可否。SharedArrayBuffer は crossOriginIsolated (COOP/COEP) が
 * 無いと使えないため、現状の配信設定では false になる想定。
 */
export function detectWasmThreads(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}
