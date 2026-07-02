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
}

export interface DetectError {
  type: 'DETECT_ERROR';
  error: string;
  timestamp?: number;
  keystrokeIndex?: number;
  requestId?: string;
}

export type WorkerResponse = InitSuccess | InitError | DetectResult | DetectError;
