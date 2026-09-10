import { TypingSession } from '../domain/typingSession';
import {
  createFrameTargetSelector,
  DEFAULT_FRAME_TARGET_OPTIONS,
  type FrameTargetSelectorOptions,
} from '../domain/frameTargetSelector';
import {
  cropRectForHand,
  expectedHandForKeystroke,
  otherHand,
  uncropHands,
  type CropRect,
} from '../domain/frameCrop';
import { analyzeKeystrokeAgainstTips } from '../domain/fingerAnalysis';
import type { KeyboardLayout } from '../types/kle';
import type { HandData, HandSide, SessionData, UnanalyzedSessionData } from '../types/session';
import { mapMediaPipeResults } from '../utils/mediapipeUtils';
import type { DetectRequest, SetOptionsRequest, WorkerResponse } from './workerProtocol';
import {
  createVideoFrameSource,
  type CaptureRegion,
  type FrameDecision,
  type VideoFrameSource,
} from './videoFrameSource';
import { createAnalysisProfiler } from './analysisProfiler';

const ANALYSIS_PLAYBACK_RATE = 3;
const MAX_PENDING_FRAMES = 2;
const FINALIZE_MAX_RETRIES = 100;
const FINALIZE_RETRY_DELAY_MS = 100;
/**
 * 打鍵あたりの推論フレーム。既定は keydown 以降の最初の 1 枚 (F=1)。
 * 実測: 推論は端末によらず入力解像度に依存せず、Blackview Tab 7 Pro (Mali-G57) で
 * 150〜190ms/frame。wall ≈ max(duration / 3, 打鍵数 × F × 推論時間) になるので、
 * F を増やすのは精度データを見てから。
 */
const FRAME_TARGET_OPTIONS: FrameTargetSelectorOptions = DEFAULT_FRAME_TARGET_OPTIONS;

/**
 * 「期待する手」だけを推論する設定。
 *
 * 打鍵から期待指 (= 期待する手) が分かるので、その手が写っている側だけを切り出して
 * numHands: 1 で推論すれば landmark モデルを 2 回走らせずに済む (推論 −35〜40%)。
 * 期待する手のどの指もキーに届いていなければ (逆の手で打った等) もう片方の側も
 * 推論して両手ぶん合成し、「手が違う」判定を残す。
 */
const EXPECTED_HAND_CROP = {
  enabled: true,
  /** 切り出し幅 / フレーム幅。中央線を 10% 越えて、中央付近のキーで手が境界にまたがるのを避ける。 */
  widthRatio: 0.6,
  /** 期待する手がキーに届いていないとき、もう片方の手も推論して合成する。 */
  fallbackToOtherHand: true,
  /** fingerAnalysis と同じ 1.5U。これを超えたら「期待する手では打っていない」。 */
  missDistanceU: 1.5,
  /** 通常時 (realtime feedback と共有) の numHands。解析後に戻す。 */
  defaultNumHands: 2,
  /** SET_OPTIONS の応答をこれだけ待って来なければ切り出しを諦めて全体推論に落ちる。 */
  setOptionsTimeoutMs: 5000,
};

const REGION_FULL = 'full';
const REGION_EXPECTED = 'expected';
const REGION_OTHER = 'other';

/** 切り出したフレーム 1 枚ぶんの進行状態 (動画時刻で引く)。 */
interface PendingCrop {
  keystrokeIndices: number[];
  rects: Partial<Record<string, CropRect>>;
  /** フォールバック用に保持している、もう片方の側の画像。 */
  otherBitmap: ImageBitmap | null;
  /** フォールバック中に保持している、期待する手の検出結果。 */
  expectedHands: HandData[] | null;
}

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
  // ワーカーへ送った時刻を「動画時刻|領域」で引くための表。転送 + キュー待ちの算出に使う。
  const frameSentAt = new Map<string, number>();
  const pendingCrops = new Map<number, PendingCrop>();
  const mirror = unanalyzedData.isMirrored ?? true;

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
  const keystrokeSides: (HandSide | null)[] = unanalyzedData.keystrokes.map(
    (k) => expectedHandForKeystroke(layout, k.code)
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
  // SET_OPTIONS(numHands: 1) が成功したときだけ切り出しを使う。
  let cropActive = false;
  let settleOptions: ((ok: boolean) => void) | null = null;

  const closePendingBitmaps = () => {
    for (const pending of pendingCrops.values()) pending.otherBitmap?.close();
    pendingCrops.clear();
  };

  // 解析中だけ numHands: 1 にしているので、realtime feedback 用に戻す。
  const restoreWorkerOptions = () => {
    if (!cropActive) return;
    cropActive = false;
    const request: SetOptionsRequest = {
      type: 'SET_OPTIONS',
      numHands: EXPECTED_HAND_CROP.defaultNumHands,
    };
    worker.postMessage(request);
  };

  const cleanup = () => {
    worker.removeEventListener('message', handleWorkerMessage);
    frameSource?.cancel();
    frameSource = null;
    if (finalizeTimer !== null) {
      window.clearTimeout(finalizeTimer);
      finalizeTimer = null;
    }
    closePendingBitmaps();
    restoreWorkerOptions();
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

  const sentKey = (timestamp: number, region: string) => `${timestamp}|${region}`;

  const recordRoundTrip = (timestamp: number, region: string, detectMs: number) => {
    if (!profiler.enabled) return;
    const key = sentKey(timestamp, region);
    const sentAt = frameSentAt.get(key);
    frameSentAt.delete(key);
    if (sentAt === undefined) return;

    const roundTripMs = performance.now() - sentAt;
    profiler.add('transfer.roundTrip', roundTripMs);
    // 往復時間から推論そのものを引いた残り = ImageBitmap 転送 + ワーカーのキュー待ち。
    profiler.add('transfer.queueAndCopy', Math.max(0, roundTripMs - detectMs));
  };

  const postDetect = (image: ImageBitmap, timestamp: number, region: string) => {
    pendingFrames++;
    const request: DetectRequest = { type: 'DETECT', image, timestamp, requestId: region };
    if (profiler.enabled) frameSentAt.set(sentKey(timestamp, region), performance.now());
    profiler.measure('transfer.postMessage', () => worker.postMessage(request, [image]));
  };

  const recordFrame = (hands: HandData[], timestamp: number) => {
    profiler.measure('postprocess.processFrame', () => {
      session.processFrame(hands, timestamp, canvas.width, canvas.height, mirror);
    });
  };

  /**
   * 期待する手の検出結果で、このフレームが担う打鍵のどれかがキーに届いていないか。
   * 届いていなければ逆の手で打った可能性があるので、もう片方の側も推論する。
   */
  const hasExpectedHandMiss = (hands: HandData[], keystrokeIndices: number[]): boolean => {
    const { mappedTips } = session.mapHandsToTips(hands, canvas.width, canvas.height, mirror);
    return keystrokeIndices.some((index) => {
      const keystroke = unanalyzedData.keystrokes[index];
      if (!keystroke) return false;
      const analysis = analyzeKeystrokeAgainstTips(layout, keystroke.code, mappedTips);
      // レイアウトにキーが無ければ判定不能 = フォールバックしても意味がない
      return analysis !== null && analysis.distanceU > EXPECTED_HAND_CROP.missDistanceU;
    });
  };

  // 推論キューが空いた。'wait' で止めていれば再生を再開する。
  const releaseSlot = () => {
    pendingFrames--;
    frameSource?.resume();
  };

  const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
    if (event.data.type === 'DETECT_RESULT') {
      releaseSlot();
      const { results, timestamp, profile, requestId } = event.data;
      const region = requestId ?? REGION_FULL;

      frameCounter++;
      if (frameCounter % 30 === 0) {
        console.log(`[Analysis] Processed ${frameCounter} frames. Queue: ${pendingFrames}`);
      }

      if (profile) {
        profiler.add('inference.detectForVideo', profile.detectMs);
        profiler.note('mediapipe.delegate', profile.delegate);
      }
      profiler.count('frames.inferred');
      recordRoundTrip(timestamp, region, profile?.detectMs ?? 0);

      let hands = profiler.measure('postprocess.mapResults', () => (
        results.landmarks.length > 0 ? mapMediaPipeResults(results) : []
      ));
      const pending = pendingCrops.get(timestamp);
      const rect = pending?.rects[region];
      if (rect) hands = uncropHands(hands, rect, canvas.width, canvas.height);

      if (pending && region === REGION_EXPECTED) {
        const missed = hasExpectedHandMiss(hands, pending.keystrokeIndices);
        if (missed && pending.otherBitmap) {
          profiler.count('inference.fallbackToOtherHand');
          pending.expectedHands = hands;
          const other = pending.otherBitmap;
          pending.otherBitmap = null;
          postDetect(other, timestamp, REGION_OTHER);
          return;
        }
        if (missed) {
          profiler.count(
            EXPECTED_HAND_CROP.fallbackToOtherHand
              ? 'inference.fallbackUnavailable'
              : 'targets.missedExpectedHand'
          );
        }
        pending.otherBitmap?.close();
        pendingCrops.delete(timestamp);
        recordFrame(hands, timestamp);
        return;
      }

      if (pending && region === REGION_OTHER) {
        recordFrame([...(pending.expectedHands ?? []), ...hands], timestamp);
        pendingCrops.delete(timestamp);
        return;
      }

      pendingCrops.delete(timestamp);
      recordFrame(hands, timestamp);
    } else if (event.data.type === 'DETECT_ERROR') {
      releaseSlot();
      profiler.count('frames.workerErrors');
      const { timestamp, requestId } = event.data;
      if (typeof timestamp === 'number') {
        frameSentAt.delete(sentKey(timestamp, requestId ?? REGION_FULL));
        const pending = pendingCrops.get(timestamp);
        if (pending) {
          pending.otherBitmap?.close();
          pendingCrops.delete(timestamp);
        }
      }
      console.error('[Analysis] Worker detection frame error:', event.data.error);
    } else if (event.data.type === 'SET_OPTIONS_RESULT') {
      if (!event.data.ok) {
        console.warn('[Analysis] Hand tracker option change failed:', event.data.error);
      }
      settleOptions?.(event.data.ok);
      settleOptions = null;
    }
  };

  /** このフレームで切り出す領域。期待する手が一意に決まらなければフレーム全体。 */
  const regionsFor = (timestampMs: number, keystrokeIndices: number[]): CaptureRegion[] => {
    const sides = keystrokeIndices.map((index) => keystrokeSides[index] ?? null);
    const side = sides[0];
    const unanimous = side !== null && sides.every((s) => s === side);
    if (!cropActive || !unanimous) {
      profiler.count('frames.fullFrame');
      return [{ id: REGION_FULL }];
    }

    const { widthRatio, fallbackToOtherHand } = EXPECTED_HAND_CROP;
    const expectedRect = cropRectForHand(side, mirror, canvas.width, canvas.height, widthRatio);
    const rects: Partial<Record<string, CropRect>> = { [REGION_EXPECTED]: expectedRect };
    const regions: CaptureRegion[] = [{ id: REGION_EXPECTED, rect: expectedRect }];
    if (fallbackToOtherHand) {
      const otherRect = cropRectForHand(otherHand(side), mirror, canvas.width, canvas.height, widthRatio);
      rects[REGION_OTHER] = otherRect;
      regions.push({ id: REGION_OTHER, rect: otherRect });
    }

    pendingCrops.set(timestampMs, { keystrokeIndices, rects, otherBitmap: null, expectedHands: null });
    profiler.count('frames.cropped');
    return regions;
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
      const keystrokeIndices = frameTargets.markCaptured(timestampMs);
      return { action: 'capture', regions: regionsFor(timestampMs, keystrokeIndices) };
    },
    onFrame: (image, timestamp, regionId) => {
      if (regionId === REGION_OTHER) {
        // フォールバック用。期待する手の結果が出るまで手元に置く。
        const pending = pendingCrops.get(timestamp);
        if (pending) pending.otherBitmap = image;
        else image.close();
        return;
      }
      postDetect(image, timestamp, regionId);
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

  const startFrameSource = () => {
    if (!cancelled) frameSource?.start();
  };

  if (EXPECTED_HAND_CROP.enabled) {
    onProgress({ status: 'Preparing hand tracker...' });
    // 切り出し推論は numHands: 1 が前提。切替に失敗したら従来どおり全体を両手で推論する。
    new Promise<boolean>((resolve) => {
      settleOptions = resolve;
      worker.postMessage({ type: 'SET_OPTIONS', numHands: 1 } satisfies SetOptionsRequest);
      window.setTimeout(() => {
        if (settleOptions === resolve) {
          settleOptions = null;
          resolve(false);
        }
      }, EXPECTED_HAND_CROP.setOptionsTimeoutMs);
    }).then((ok) => {
      cropActive = ok;
      if (!ok) {
        console.warn('[Analysis] Could not switch the hand tracker to numHands=1; analysing full frames.');
      }
      profiler.note(
        'analysis.expectedHandCrop',
        ok
          ? `on (width ${EXPECTED_HAND_CROP.widthRatio}, fallback ${EXPECTED_HAND_CROP.fallbackToOtherHand})`
          : 'off (option change failed)'
      );
      startFrameSource();
    });
  } else {
    profiler.note('analysis.expectedHandCrop', 'disabled');
    startFrameSource();
  }

  return {
    cancel: () => {
      cancelled = true;
      cleanup();
    }
  };
}
