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

export type WorkerRequest = InitRequest | DetectRequest;

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

export type WorkerResponse = InitSuccess | InitError | DetectResult | DetectError;
