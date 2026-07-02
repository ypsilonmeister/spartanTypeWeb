import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  HAND_LANDMARKER_OPTIONS,
  MEDIAPIPE_WASM_URL,
} from '../infra/handLandmarkerConfig';

export class HandTracker {
  private static instance: HandTracker | null = null;
  private landmarker: HandLandmarker | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): HandTracker {
    if (!HandTracker.instance) {
      HandTracker.instance = new HandTracker();
    }
    return HandTracker.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        this.landmarker = await HandLandmarker.createFromOptions(vision, HAND_LANDMARKER_OPTIONS);

        this.isInitialized = true;
      } catch (error) {
        console.error('Failed to initialize HandLandmarker:', error);
        throw error;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public detectForVideo(videoElement: HTMLVideoElement, timestamp: number) {
    if (!this.isInitialized || !this.landmarker) {
      return null;
    }
    return this.landmarker.detectForVideo(videoElement, timestamp);
  }
}
