import type { HandLandmarkerOptions } from '@mediapipe/tasks-vision';

export const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

export const HAND_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const HAND_LANDMARKER_OPTIONS: HandLandmarkerOptions = {
  baseOptions: {
    modelAssetPath: HAND_LANDMARKER_MODEL_URL,
    delegate: 'GPU',
  },
  runningMode: 'VIDEO',
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};
