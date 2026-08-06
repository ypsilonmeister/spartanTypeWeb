import { TypingSession } from '../domain/typingSession';
import type { KeyboardLayout } from '../types/kle';
import type { SessionData, UnanalyzedSessionData } from '../types/session';
import { mapMediaPipeResults } from '../utils/mediapipeUtils';
import type { DetectRequest, WorkerResponse } from './workerProtocol';
import { createVideoFrameSource, type VideoFrameSource } from './videoFrameSource';

const ANALYSIS_PLAYBACK_RATE = 3;
const MAX_PENDING_FRAMES = 2;
const FINALIZE_MAX_RETRIES = 100;
const FINALIZE_RETRY_DELAY_MS = 100;

export interface OfflineAnalysisProgress {
  progress?: number;
  status?: string;
}

interface OfflineAnalysisOptions {
  unanalyzedData: UnanalyzedSessionData;
  layout: KeyboardLayout;
  worker: Worker;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onProgress: (progress: OfflineAnalysisProgress) => void;
  onComplete: (data: SessionData) => void;
}

export interface OfflineAnalysisRun {
  cancel: () => void;
}

export function runOfflineAnalysis(options: OfflineAnalysisOptions): OfflineAnalysisRun {
  const {
    unanalyzedData,
    layout,
    worker,
    video,
    canvas,
    onProgress,
    onComplete,
  } = options;

  const session = new TypingSession(
    layout,
    unanalyzedData.homography,
    unanalyzedData.calibrationCameraSize
  );

  if (!unanalyzedData.blob) {
    session.loadKeystrokes(unanalyzedData.keystrokes);
    onComplete(JSON.parse(session.exportSession()));
    return { cancel: () => {} };
  }

  session.startSession();

  let cancelled = false;
  let pendingFrames = 0;
  let frameCounter = 0;
  let isFinalized = false;
  let finalizeRetryCount = 0;
  let frameSource: VideoFrameSource | null = null;
  let finalizeTimer: number | null = null;

  const cleanup = () => {
    worker.removeEventListener('message', handleWorkerMessage);
    frameSource?.cancel();
    frameSource = null;
    if (finalizeTimer !== null) {
      window.clearTimeout(finalizeTimer);
      finalizeTimer = null;
    }
  };

  const finalize = () => {
    if (isFinalized) return;

    if (pendingFrames > 0 && finalizeRetryCount < FINALIZE_MAX_RETRIES) {
      finalizeRetryCount++;
      console.log(
        `[Analysis] Finalizing queued. Waiting for ${pendingFrames} pending frames to resolve... ` +
        `(retry ${finalizeRetryCount}/${FINALIZE_MAX_RETRIES})`
      );
      finalizeTimer = window.setTimeout(finalize, FINALIZE_RETRY_DELAY_MS);
      return;
    }

    if (pendingFrames > 0) {
      console.warn(`[Analysis] Timed out waiting for ${pendingFrames} pending frames. Proceeding with available data.`);
    }

    isFinalized = true;
    cleanup();

    onProgress({ status: 'Finalizing session data...' });
    console.log(`[Analysis] Frame processing complete. Total analyzed frames: ${frameCounter}. Exporting session JSON...`);
    session.loadKeystrokes(unanalyzedData.keystrokes);

    if (!cancelled) {
      onComplete(JSON.parse(session.exportSession()));
    }
  };

  const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
    if (event.data.type === 'DETECT_RESULT') {
      pendingFrames--;
      const { results, timestamp } = event.data;

      frameCounter++;
      if (frameCounter % 30 === 0) {
        console.log(`[Analysis] Processed ${frameCounter} frames. Queue: ${pendingFrames}`);
      }

      const handsData = results.landmarks.length > 0 ? mapMediaPipeResults(results) : [];
      session.processFrame(
        handsData,
        timestamp,
        canvas.width,
        canvas.height,
        unanalyzedData.isMirrored ?? true
      );
    } else if (event.data.type === 'DETECT_ERROR') {
      pendingFrames--;
      console.error('[Analysis] Worker detection frame error:', event.data.error);
    }
  };

  worker.addEventListener('message', handleWorkerMessage);

  frameSource = createVideoFrameSource({
    blob: unanalyzedData.blob,
    video,
    canvas,
    playbackRate: ANALYSIS_PLAYBACK_RATE,
    expectedDurationSeconds: unanalyzedData.recordingDurationMs
      ? unanalyzedData.recordingDurationMs / 1000
      : undefined,
    shouldCaptureFrame: () => pendingFrames < MAX_PENDING_FRAMES,
    onFrame: (image, timestamp) => {
      pendingFrames++;
      const request: DetectRequest = { type: 'DETECT', image, timestamp };
      worker.postMessage(request, [image]);
    },
    onProgress: (progress) => onProgress({ progress }),
    onLoaded: (width, height, duration) => {
      console.log(
        `[Analysis] Video metadata loaded. Resolution: ${width}x${height}, Duration: ${duration.toFixed(2)}s`
      );
      onProgress({ status: `Analyzing frames at ${ANALYSIS_PLAYBACK_RATE}x...` });
    },
    onEnded: () => {
      console.log('[Analysis] Video ended event fired. Finalizing...');
      finalize();
    },
    onError: (error) => {
      console.error('[Analysis] Video analysis error:', error);
      onProgress({ status: 'Failed to analyze recorded video.' });
      cleanup();
    },
  });

  frameSource.start();

  return {
    cancel: () => {
      cancelled = true;
      cleanup();
    }
  };
}
