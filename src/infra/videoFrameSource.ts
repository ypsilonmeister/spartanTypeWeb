import { noopAnalysisProfiler, type AnalysisProfiler } from './analysisProfiler';
import type { CropRect } from '../domain/frameCrop';

type VideoWithCallback = HTMLVideoElement & {
  requestVideoFrameCallback: (callback: () => void) => number;
};

/**
 * 1 フレームから切り出す領域。rect が無ければフレーム全体。
 * 呼び出し側は id で「どの領域の ImageBitmap か」を受け取る。
 */
export interface CaptureRegion {
  id: string;
  rect?: CropRect;
}

/**
 * 提示されたフレームをどう扱うか。
 * - capture: 指定した領域ごとに ImageBitmap 化して onFrame へ渡す
 * - skip:    何もしない (推論対象ではない)
 * - wait:    推論したいがキューが埋まっている。フレームを捨てずに再生を止め、
 *            resume() が呼ばれたら同じフレームを評価し直す
 */
export type FrameDecision =
  | 'skip'
  | 'wait'
  | { action: 'capture'; regions: CaptureRegion[] };

interface VideoFrameSourceOptions {
  blob: Blob;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  playbackRate: number;
  expectedDurationSeconds?: number;
  /** 提示フレームの動画時刻 (ms) を受け取り、扱いを返す。 */
  decideFrame: (timestampMs: number) => FrameDecision;
  onFrame: (bitmap: ImageBitmap, timestampMs: number, regionId: string) => void;
  onProgress: (progress: number) => void;
  onLoaded: (width: number, height: number, duration: number) => void;
  onEnded: () => void;
  onError: (error: unknown) => void;
  /** 計測用。VITE_ANALYSIS_PROFILE が無効なときは no-op が渡る。 */
  profiler?: AnalysisProfiler;
}

export interface VideoFrameSource {
  start: () => void;
  cancel: () => void;
  /** 'wait' で止めた再生を再開する。止まっていなければ何もしない。 */
  resume: () => void;
}

export function calculatePlaybackProgress(
  currentTime: number,
  metadataDuration: number,
  expectedDurationSeconds?: number
): number {
  const duration = Number.isFinite(metadataDuration) && metadataDuration > 0
    ? metadataDuration
    : expectedDurationSeconds;

  if (!duration || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}

export function createVideoFrameSource(options: VideoFrameSourceOptions): VideoFrameSource {
  const {
    blob,
    video,
    canvas,
    playbackRate,
    expectedDurationSeconds,
    decideFrame,
    onFrame,
    onProgress,
    onLoaded,
    onEnded,
    onError,
    profiler = noopAnalysisProfiler,
  } = options;

  let cancelled = false;
  let ended = false;
  // 'wait' で自分から止めている間 true。video.paused だけでは「解析が終わった」
  // 扱いになってしまうので、意図した一時停止と区別する。
  let pausedForBackpressure = false;
  let pauseStartedAt = 0;
  let lastProcessedTime = -1;
  // 計測専用。lastProcessedTime と違い「キャプチャできたか」に関係なく
  // 新しく提示されたフレームを 1 回だけ数えるために使う。
  let lastSeenTime = -1;
  const url = URL.createObjectURL(blob);

  const getDuration = () => (
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : expectedDurationSeconds
  );

  const reportProgress = () => {
    onProgress(calculatePlaybackProgress(
      video.currentTime,
      video.duration,
      expectedDurationSeconds
    ));
  };

  const requestNextFrame = (callback: () => void) => {
    if ('requestVideoFrameCallback' in video) {
      (video as VideoWithCallback).requestVideoFrameCallback(callback);
    } else {
      requestAnimationFrame(callback);
    }
  };

  /** 領域 1 つぶんの ImageBitmap を作る。切り出しは video から直接、全体は canvas 経由。 */
  const bitmapForRegion = (region: CaptureRegion): Promise<ImageBitmap> => {
    if (region.rect) {
      const { x, y, width, height } = region.rect;
      return createImageBitmap(video, x, y, width, height);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return Promise.reject(new Error('Could not create analysis canvas context.'));
    }
    profiler.measure('decode.drawImage', () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    });
    return createImageBitmap(canvas);
  };

  const captureCurrentFrame = (regions: CaptureRegion[]) => {
    lastProcessedTime = video.currentTime;
    // 時刻はキャプチャを決めた時点で確定させる (createImageBitmap の解決を待つ間に
    // video.currentTime が進んでも、この ImageBitmap はこの時刻のフレーム)。
    const timestampMs = video.currentTime * 1000;

    profiler.count('frames.captured');
    for (const region of regions) {
      profiler.count('frames.capturedRegions');
      const endBitmapSpan = profiler.span('decode.createImageBitmap');
      bitmapForRegion(region)
        .then((bitmap) => {
          endBitmapSpan();
          if (cancelled || ended) {
            bitmap.close();
            return;
          }
          onFrame(bitmap, timestampMs, region.id);
        })
        .catch((error) => {
          endBitmapSpan();
          onError(error);
        });
    }
  };

  /**
   * 今 video に出ているフレームを 1 回評価する。
   * 戻り値 false = 'wait' で再生を止めたので、フレームループを継続しない。
   */
  const evaluateCurrentFrame = (): boolean => {
    const isNewlyPresentedFrame = video.currentTime !== lastSeenTime;
    if (isNewlyPresentedFrame) {
      lastSeenTime = video.currentTime;
      profiler.count('frames.presented');
    }

    if (video.currentTime === lastProcessedTime) return true;

    const decision = decideFrame(video.currentTime * 1000);
    if (decision === 'wait') {
      // 目標フレームなのに推論キューが埋まっている。捨てずに止めて待つ。
      // 再生を止めれば新しいフレームは提示されないので、ループもここで途切れる。
      pausedForBackpressure = true;
      pauseStartedAt = performance.now();
      profiler.count('frames.waitedForSlot');
      video.pause();
      reportProgress();
      return false;
    }
    if (decision === 'skip') {
      if (isNewlyPresentedFrame) profiler.count('frames.skipped');
      return true;
    }
    captureCurrentFrame(decision.regions);
    return true;
  };

  const processVideoFrame = () => {
    if (cancelled || ended) return;
    if (video.ended || (video.paused && !pausedForBackpressure)) {
      ended = true;
      onEnded();
      return;
    }

    profiler.count('frames.callbackTicks');

    if (!evaluateCurrentFrame()) return;

    reportProgress();
    requestNextFrame(processVideoFrame);
  };

  const resume = () => {
    if (!pausedForBackpressure || cancelled || ended) return;
    profiler.add('wait.pausedMs', performance.now() - pauseStartedAt);

    // 止めていたフレームをまず評価し直す (キューが空いたので capture になるはず)。
    // まだ埋まっていれば再び 'wait' になり、pausedForBackpressure は立ったまま。
    pausedForBackpressure = false;
    const shouldContinue = evaluateCurrentFrame();
    if (!shouldContinue) return;

    video.play()
      .then(() => requestNextFrame(processVideoFrame))
      .catch(onError);
  };

  const handleLoadedData = () => {
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    onLoaded(video.videoWidth, video.videoHeight, getDuration() ?? video.duration);

    video.playbackRate = playbackRate;
    video.play()
      .then(() => requestNextFrame(processVideoFrame))
      .catch(onError);
  };

  const handleEnded = () => {
    if (ended) return;
    ended = true;
    onProgress(100);
    onEnded();
  };

  const handleError = (event: Event) => {
    onError(event);
  };

  return {
    start: () => {
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('ended', handleEnded);
      video.addEventListener('error', handleError);
      video.src = url;
    },
    resume,
    cancel: () => {
      cancelled = true;
      pausedForBackpressure = false;
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  };
}
