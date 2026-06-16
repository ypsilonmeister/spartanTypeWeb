import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

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
        // Use the CDN for WASM files to avoid complex Vite static asset handling in Phase 1/2
        const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
      );

      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: 'GPU', // Use GPU acceleration if available
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

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
