import { TypingSession } from '../domain/typingSession';
import {
  createFrameTargetSelector,
  DEFAULT_FRAME_TARGET_OPTIONS,
  type FrameTargetSelectorOptions,
} from '../domain/frameTargetSelector';
import type { KeyboardLayout } from '../types/kle';
import type { SessionData, UnanalyzedSessionData } from '../types/session';
import { mapMediaPipeResults } from '../utils/mediapipeUtils';
import type { DetectRequest, WorkerResponse } from './workerProtocol';
import {
  createVideoFrameSource,
  type FrameDecision,
  type VideoFrameSource,
} from './videoFrameSource';
import { createAnalysisProfiler } from './analysisProfiler';

const ANALYSIS_PLAYBACK_RATE = 3;
const MAX_PENDING_FRAMES = 2;
/**
 * 打鍵あたりの推論フレーム。既定は keydown 以降の最初の 1 枚 (F=1)。
 * 実測: 推論は端末によらず入力解像度に依存せず、Blackview Tab 7 Pro (Mali-G57) で
 * 150ms/frame。wall ≈ max(duration / 3, 打鍵数 × F × 0.15s) になるので、
 * F を増やすのは精度データを見てから。
 */
const FRAME_TARGET_OPTIONS: FrameTargetSelectorOptions = DEFAULT_FRAME_TARGET_OPTIONS;
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

  const profiler = createAnalysisProfiler();
  // ワーカーへ送った時刻を timestamp で引くための表。転送 + キュー待ちの算出に使う。
  const frameSentAt = new Map<number, number>();

  const session = new TypingSession(
    layout,
    unanalyzedData.homography,
    unanalyzedData.calibrationCameraSize
  );

  // 打鍵時刻 (セッション開始からの ms) と動画時刻 (先頭からの ms) は同じ原点を
  // 共有している前提 (TrainerScreen の sessionStartRef と録画開始)。
  const frameTargets = createFrameTargetSelector(
    unanalyzedData.keystrokes.map((k) => k.timestamp),
    FRAME_TARGET_OPTIONS
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

    const targetStats = frameTargets.finish();
    profiler.count('targets.total', targetStats.total);
    profiler.count('targets.captured', targetStats.captured);
    profiler.count('targets.late', targetStats.late);
    profiler.count('targets.abandoned', targetStats.abandoned);
    profiler.count('targets.unreached', targetStats.unreached);

    onProgress({ status: 'Finalizing session data...' });
    console.log(
      `[Analysis] Frame processing complete. Analyzed frames: ${frameCounter}. ` +
      `Keystroke targets: ${targetStats.captured}/${targetStats.total} captured, ` +
      `${targetStats.late} late, ${targetStats.abandoned} abandoned, ${targetStats.unreached} unreached. ` +
      'Exporting session JSON...'
    );
    session.loadKeystrokes(unanalyzedData.keystrokes);

    if (!cancelled) {
      // exportSession は打鍵 ↔ フレームの対応付け (findNearestFrame) と
      // 指判定・JSON 化をまとめて行うため、集計コストはここに現れる。
      const exported = profiler.measure('finalize.exportSession', () => session.exportSession());
      const parsed = profiler.measure('finalize.parseJson', () => JSON.parse(exported));
      profiler.count('session.loggedFrames', session.getFrames().length);
      profiler.report('offline analysis');
      onComplete(parsed);
    } else {
      profiler.report('offline analysis (cancelled)');
    }
  };

  const recordRoundTrip = (timestamp: number, detectMs: number) => {
    if (!profiler.enabled) return;
    const sentAt = frameSentAt.get(timestamp);
    frameSentAt.delete(timestamp);
    if (sentAt === undefined) return;

    const roundTripMs = performance.now() - sentAt;
    profiler.add('transfer.roundTrip', roundTripMs);
    // 往復時間から推論そのものを引いた残り = ImageBitmap 転送 + ワーカーのキュー待ち。
    profiler.add('transfer.queueAndCopy', Math.max(0, roundTripMs - detectMs));
  };

  // 推論キューが空いた。'wait' で止めていれば再生を再開する。
  const releaseSlot = () => {
    pendingFrames--;
    frameSource?.resume();
  };

  const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
    if (event.data.type === 'DETECT_RESULT') {
      releaseSlot();
      const { results, timestamp, profile } = event.data;

      frameCounter++;
      if (frameCounter % 30 === 0) {
        console.log(`[Analysis] Processed ${frameCounter} frames. Queue: ${pendingFrames}`);
      }

      if (profile) {
        profiler.add('inference.detectForVideo', profile.detectMs);
        profiler.note('mediapipe.delegate', profile.delegate);
      }
      profiler.count('frames.inferred');
      recordRoundTrip(timestamp, profile?.detectMs ?? 0);

      const handsData = profiler.measure('postprocess.mapResults', () => (
        results.landmarks.length > 0 ? mapMediaPipeResults(results) : []
      ));
      profiler.measure('postprocess.processFrame', () => {
        session.processFrame(
          handsData,
          timestamp,
          canvas.width,
          canvas.height,
          unanalyzedData.isMirrored ?? true
        );
      });
    } else if (event.data.type === 'DETECT_ERROR') {
      releaseSlot();
      profiler.count('frames.workerErrors');
      if (typeof event.data.timestamp === 'number') {
        frameSentAt.delete(event.data.timestamp);
      }
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
    decideFrame: (timestampMs): FrameDecision => {
      if (!frameTargets.wants(timestampMs)) return 'skip';
      if (pendingFrames >= MAX_PENDING_FRAMES) return 'wait';
      // capture を返した時点で確定させる。onFrame (createImageBitmap 後) まで待つと、
      // その間に次のフレームが来て同じ目標を二重に取ってしまう。
      frameTargets.markCaptured(timestampMs);
      return 'capture';
    },
    onFrame: (image, timestamp) => {
      pendingFrames++;
      const request: DetectRequest = { type: 'DETECT', image, timestamp };
      if (profiler.enabled) frameSentAt.set(timestamp, performance.now());
      profiler.measure('transfer.postMessage', () => worker.postMessage(request, [image]));
    },
    onProgress: (progress) => onProgress({ progress }),
    onLoaded: (width, height, duration) => {
      console.log(
        `[Analysis] Video metadata loaded. Resolution: ${width}x${height}, Duration: ${duration.toFixed(2)}s`
      );
      profiler.note('video.resolution', `${width}x${height}`);
      profiler.note('video.durationSec', Number(duration.toFixed(2)));
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
      profiler.report('offline analysis (failed)');
    },
    profiler,
  });

  profiler.note(
    'session.durationSec',
    unanalyzedData.recordingDurationMs
      ? Number((unanalyzedData.recordingDurationMs / 1000).toFixed(2))
      : 'unknown'
  );
  profiler.note('session.keystrokes', unanalyzedData.keystrokes.length);
  profiler.note('analysis.playbackRate', ANALYSIS_PLAYBACK_RATE);
  profiler.note('analysis.maxPendingFrames', MAX_PENDING_FRAMES);
  profiler.note('analysis.frameTargetOffsetsMs', FRAME_TARGET_OPTIONS.offsetsMs.join(','));
  profiler.note('analysis.frameTargets', frameTargets.targetCount());
  profiler.note(
    'video.frameCallback',
    'requestVideoFrameCallback' in video ? 'requestVideoFrameCallback' : 'requestAnimationFrame'
  );

  frameSource.start();

  return {
    cancel: () => {
      cancelled = true;
      cleanup();
    }
  };
}
