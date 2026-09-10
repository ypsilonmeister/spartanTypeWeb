import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  createHandLandmarkerOptions,
  MEDIAPIPE_WASM_URL,
} from '../infra/handLandmarkerConfig';
import type { DetectProfile, WorkerRequest, WorkerResponse } from '../infra/workerProtocol';
import { isAnalysisProfilingEnabled } from '../infra/analysisProfiler';

let landmarker: HandLandmarker | null = null;
let activeDelegate: 'GPU' | 'CPU' = 'GPU';
let isInitializing = false;
let timestampOffset = 0;
let lastDetectTimestamp = -Infinity;

function getMonotonicDetectTimestamp(timestamp: number): number {
  if (!Number.isFinite(timestamp)) {
    return lastDetectTimestamp + 1;
  }

  if (timestamp + timestampOffset <= lastDetectTimestamp) {
    timestampOffset = lastDetectTimestamp + 1 - timestamp;
  }

  lastDetectTimestamp = timestamp + timestampOffset;
  return lastDetectTimestamp;
}

// Initialize the landmarker when the worker starts.
// Android タブレット等では WebWorker 内の GPU デリゲート初期化が失敗しがちなので、
// 失敗したら CPU デリゲートへフォールバックして解析を継続できるようにする。
async function initLandmarker() {
  if (landmarker || isInitializing) return;
  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

    try {
      landmarker = await HandLandmarker.createFromOptions(
        vision,
        createHandLandmarkerOptions('GPU')
      );
      activeDelegate = 'GPU';
    } catch (gpuErr) {
      console.warn(
        'Worker GPU delegate init failed, falling back to CPU:',
        gpuErr
      );
      landmarker = await HandLandmarker.createFromOptions(
        vision,
        createHandLandmarkerOptions('CPU')
      );
      activeDelegate = 'CPU';
    }

    if (isAnalysisProfilingEnabled) {
      console.log(`[AnalysisProfile] HandLandmarker delegate: ${activeDelegate}`);
    }

    self.postMessage({ type: 'INIT_SUCCESS' } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({
      type: 'INIT_ERROR',
      error: err instanceof Error ? err.message : String(err)
    } satisfies WorkerResponse);
  } finally {
    isInitializing = false;
  }
}

// numHands 等を実行時に切り替える。setOptions はグラフを作り直すため
// 1 フレームごとではなく解析の開始/終了で呼ぶ。
async function applyOptions(numHands: number) {
  if (!landmarker) {
    self.postMessage({
      type: 'SET_OPTIONS_RESULT',
      numHands,
      ok: false,
      error: 'HandLandmarker is not initialized.'
    } satisfies WorkerResponse);
    return;
  }
  try {
    await landmarker.setOptions({ numHands });
    self.postMessage({ type: 'SET_OPTIONS_RESULT', numHands, ok: true } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({
      type: 'SET_OPTIONS_RESULT',
      numHands,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    } satisfies WorkerResponse);
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const request = e.data;

  if (request.type === 'INIT') {
    initLandmarker();
  } else if (request.type === 'SET_OPTIONS') {
    applyOptions(request.numHands);
  } else if (request.type === 'DETECT' && landmarker && request.image) {
    try {
      const detectTimestamp = getMonotonicDetectTimestamp(request.timestamp);
      const detectStart = isAnalysisProfilingEnabled ? performance.now() : 0;
      const results = landmarker.detectForVideo(request.image, detectTimestamp);
      const profile: DetectProfile | undefined = isAnalysisProfilingEnabled
        ? { detectMs: performance.now() - detectStart, delegate: activeDelegate }
        : undefined;

      // Post results back to main thread.
      // keystrokeIndex はリアルタイム解析で送られてきた場合のみ存在し、
      // 応答をトリガーとなったキーストロークへ確実に対応付けるために echo back する。
      self.postMessage({
        type: 'DETECT_RESULT',
        results,
        timestamp: request.timestamp,
        keystrokeIndex: request.keystrokeIndex,
        requestId: request.requestId,
        profile
      } satisfies WorkerResponse);
    } catch (err) {
      console.error('Worker detection error:', err);
      self.postMessage({
        type: 'DETECT_ERROR',
        error: String(err),
        timestamp: request.timestamp,
        keystrokeIndex: request.keystrokeIndex,
        requestId: request.requestId
      } satisfies WorkerResponse);
    } finally {
      // Ensure we don't leak ImageBitmaps
      if (typeof request.image.close === 'function') {
        request.image.close();
      }
    }
  } else if (request.type === 'DETECT' && request.image) {
    if (typeof request.image.close === 'function') {
      request.image.close();
    }
  }
};
