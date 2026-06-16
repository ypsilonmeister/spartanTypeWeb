import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarker: HandLandmarker | null = null;
let isInitializing = false;

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
  const { type, image, timestamp } = e.data;
  
  if (type === 'INIT') {
    initLandmarker();
  } else if (type === 'DETECT' && landmarker && image) {
    try {
      const results = landmarker.detectForVideo(image as ImageBitmap, timestamp);
      
      // Post results back to main thread
      self.postMessage({ type: 'DETECT_RESULT', results, timestamp });
    } catch (err) {
      console.error('Worker detection error:', err);
      self.postMessage({ type: 'DETECT_ERROR', error: String(err), timestamp });
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
