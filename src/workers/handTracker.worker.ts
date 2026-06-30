import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarker: HandLandmarker | null = null;
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

// Initialize the landmarker when the worker starts
async function initLandmarker() {
  if (landmarker || isInitializing) return;
  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    );
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    self.postMessage({ type: 'INIT_SUCCESS' });
  } catch (err) {
    self.postMessage({ 
      type: 'INIT_ERROR', 
      error: err instanceof Error ? err.message : String(err) 
    });
  } finally {
    isInitializing = false;
  }
}

self.onmessage = (e: MessageEvent) => {
  const { type, image, timestamp, keystrokeIndex, requestId } = e.data;

  if (type === 'INIT') {
    initLandmarker();
  } else if (type === 'DETECT' && landmarker && image) {
    try {
      const detectTimestamp = getMonotonicDetectTimestamp(timestamp);
      const results = landmarker.detectForVideo(image as ImageBitmap, detectTimestamp);

      // Post results back to main thread.
      // keystrokeIndex はリアルタイム解析で送られてきた場合のみ存在し、
      // 応答をトリガーとなったキーストロークへ確実に対応付けるために echo back する。
      self.postMessage({ type: 'DETECT_RESULT', results, timestamp, keystrokeIndex, requestId });
    } catch (err) {
      console.error('Worker detection error:', err);
      self.postMessage({ type: 'DETECT_ERROR', error: String(err), timestamp, keystrokeIndex, requestId });
    } finally {
      // Ensure we don't leak ImageBitmaps
      if (image && typeof image.close === 'function') {
        image.close();
      }
    }
  } else if (type === 'DETECT' && image) {
    if (typeof image.close === 'function') {
      image.close();
    }
  }
};
