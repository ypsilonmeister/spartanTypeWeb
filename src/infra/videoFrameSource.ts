type VideoWithCallback = HTMLVideoElement & {
  requestVideoFrameCallback: (callback: () => void) => number;
};

interface VideoFrameSourceOptions {
  blob: Blob;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  playbackRate: number;
  shouldCaptureFrame: () => boolean;
  onFrame: (bitmap: ImageBitmap, timestamp: number) => void;
  onProgress: (progress: number) => void;
  onLoaded: (width: number, height: number, duration: number) => void;
  onEnded: () => void;
  onError: (error: unknown) => void;
}

export interface VideoFrameSource {
  start: () => void;
  cancel: () => void;
}

export function createVideoFrameSource(options: VideoFrameSourceOptions): VideoFrameSource {
  const {
    blob,
    video,
    canvas,
    playbackRate,
    shouldCaptureFrame,
    onFrame,
    onProgress,
    onLoaded,
    onEnded,
    onError,
  } = options;

  let cancelled = false;
  let ended = false;
  let lastProcessedTime = -1;
  const url = URL.createObjectURL(blob);

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

    if (video.currentTime !== lastProcessedTime && shouldCaptureFrame()) {
      lastProcessedTime = video.currentTime;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onError(new Error('Could not create analysis canvas context.'));
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      createImageBitmap(canvas)
        .then((bitmap) => {
          if (cancelled || ended) {
            bitmap.close();
            return;
          }
          onFrame(bitmap, video.currentTime * 1000);
        })
        .catch(onError);
    }

    onProgress(Number.isFinite(video.duration) ? (video.currentTime / video.duration) * 100 : 0);
    requestNextFrame(processVideoFrame);
  };

  const handleLoadedData = () => {
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    onLoaded(video.videoWidth, video.videoHeight, video.duration);

    video.playbackRate = playbackRate;
    video.play()
      .then(() => requestNextFrame(processVideoFrame))
      .catch(onError);
  };

  const handleEnded = () => {
    if (ended) return;
    ended = true;
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
