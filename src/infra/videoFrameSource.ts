import { noopAnalysisProfiler, type AnalysisProfiler } from './analysisProfiler';

type VideoWithCallback = HTMLVideoElement & {
  requestVideoFrameCallback: (callback: () => void) => number;
};

interface VideoFrameSourceOptions {
  blob: Blob;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  playbackRate: number;
  expectedDurationSeconds?: number;
  shouldCaptureFrame: () => boolean;
  onFrame: (bitmap: ImageBitmap, timestamp: number) => void;
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
    shouldCaptureFrame,
    onFrame,
    onProgress,
    onLoaded,
    onEnded,
    onError,
    profiler = noopAnalysisProfiler,
  } = options;

  let cancelled = false;
  let ended = false;
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

  const processVideoFrame = () => {
    if (cancelled || ended) return;
    if (video.paused || video.ended) {
      ended = true;
      onEnded();
      return;
    }

    profiler.count('frames.callbackTicks');

    const isNewlyPresentedFrame = video.currentTime !== lastSeenTime;
    if (isNewlyPresentedFrame) {
      lastSeenTime = video.currentTime;
      profiler.count('frames.presented');
    }

    if (video.currentTime !== lastProcessedTime) {
      if (shouldCaptureFrame()) {
        lastProcessedTime = video.currentTime;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onError(new Error('Could not create analysis canvas context.'));
          return;
        }

        profiler.count('frames.captured');
        profiler.measure('decode.drawImage', () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        });

        const endBitmapSpan = profiler.span('decode.createImageBitmap');
        createImageBitmap(canvas)
          .then((bitmap) => {
            endBitmapSpan();
            if (cancelled || ended) {
              bitmap.close();
              return;
            }
            onFrame(bitmap, video.currentTime * 1000);
          })
          .catch((error) => {
            endBitmapSpan();
            onError(error);
          });
      } else if (isNewlyPresentedFrame) {
        // 推論キューが詰まっているために捨てられたフレーム (既存の間引き)。
        profiler.count('frames.skippedByBackpressure');
      }
    }

    reportProgress();
    requestNextFrame(processVideoFrame);
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
    cancel: () => {
      cancelled = true;
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
