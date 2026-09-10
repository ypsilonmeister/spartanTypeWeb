import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

export interface InitRequest {
  type: 'INIT';
}

export interface DetectRequest {
  type: 'DETECT';
  image: ImageBitmap;
  timestamp: number;
  keystrokeIndex?: number;
  requestId?: string;
}

/**
 * 推論オプションの切替。オフライン解析は「期待する手」だけを切り出して numHands: 1 で
 * 推論し、終わったら realtime feedback 用に 2 へ戻す (ワーカーは両者で共有)。
 */
export interface SetOptionsRequest {
  type: 'SET_OPTIONS';
  numHands: number;
}

export type WorkerRequest = InitRequest | DetectRequest | SetOptionsRequest;

/**
 * 計測用のワーカー側実測値。VITE_ANALYSIS_PROFILE が有効なときだけ付与される。
 * 無効時は常に undefined なので通常のペイロードは変わらない。
 */
export interface DetectProfile {
  /** landmarker.detectForVideo() 単体の所要時間 (ms)。 */
  detectMs: number;
  /** 実際に初期化できた MediaPipe デリゲート。 */
  delegate: 'GPU' | 'CPU';
}

export interface InitSuccess {
  type: 'INIT_SUCCESS';
}

export interface InitError {
  type: 'INIT_ERROR';
  error: string;
}

export interface DetectResult {
  type: 'DETECT_RESULT';
  results: HandLandmarkerResult;
  timestamp: number;
  keystrokeIndex?: number;
  requestId?: string;
  profile?: DetectProfile;
}

export interface DetectError {
  type: 'DETECT_ERROR';
  error: string;
  timestamp?: number;
  keystrokeIndex?: number;
  requestId?: string;
}

export interface SetOptionsResult {
  type: 'SET_OPTIONS_RESULT';
  numHands: number;
  ok: boolean;
  error?: string;
}

export type WorkerResponse =
  | InitSuccess
  | InitError
  | DetectResult
  | DetectError
  | SetOptionsResult;
