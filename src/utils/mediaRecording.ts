export const PREFERRED_RECORDING_MIME_TYPES = [
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
  'video/mp4',
] as const;

export type RecordingUnavailableReason =
  | 'no-stream'
  | 'no-media-recorder'
  | 'no-canvas-capture-stream'
  | 'unsupported-mime-type';

export type RecordingCapability =
  | { available: true; mimeType?: string }
  | { available: false; reason: RecordingUnavailableReason };

export interface RecordingEnvironment {
  hasStream: boolean;
  hasMediaRecorder: boolean;
  isTypeSupported?: (mimeType: string) => boolean;
  hasCanvasCaptureStream: boolean;
}

export function selectSupportedRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string | undefined {
  return PREFERRED_RECORDING_MIME_TYPES.find(isTypeSupported);
}

/**
 * 録画に必要な環境条件を評価する純関数。
 * ブラウザ API やストリームの有無を切り離してテストできるようにしている。
 */
export function evaluateRecordingCapability(env: RecordingEnvironment): RecordingCapability {
  if (!env.hasMediaRecorder) {
    return { available: false, reason: 'no-media-recorder' };
  }
  if (!env.hasCanvasCaptureStream) {
    return { available: false, reason: 'no-canvas-capture-stream' };
  }
  if (!env.hasStream) {
    return { available: false, reason: 'no-stream' };
  }
  const mimeType = env.isTypeSupported
    ? selectSupportedRecordingMimeType(env.isTypeSupported)
    : undefined;
  return mimeType ? { available: true, mimeType } : { available: true };
}

export function probeRecordingEnvironment(
  stream: MediaStream | null | undefined,
  canvas?: HTMLCanvasElement | null
): RecordingEnvironment {
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const isTypeSupported =
    hasMediaRecorder && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported.bind(MediaRecorder)
      : undefined;
  const hasCanvasCaptureStream = canvas
    ? typeof canvas.captureStream === 'function'
    : typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype?.captureStream === 'function';

  return {
    hasStream: Boolean(stream),
    hasMediaRecorder,
    isTypeSupported,
    hasCanvasCaptureStream,
  };
}

export function detectRecordingCapability(
  stream: MediaStream | null | undefined,
  canvas?: HTMLCanvasElement | null
): RecordingCapability {
  return evaluateRecordingCapability(probeRecordingEnvironment(stream, canvas));
}

export function getRecordingUnavailableTranslationKey(reason: RecordingUnavailableReason): string {
  switch (reason) {
    case 'no-stream':
      return 'trainer.recordingUnavailable.noStream';
    case 'no-media-recorder':
      return 'trainer.recordingUnavailable.noMediaRecorder';
    case 'no-canvas-capture-stream':
      return 'trainer.recordingUnavailable.noCanvasCaptureStream';
    case 'unsupported-mime-type':
      return 'trainer.recordingUnavailable.unsupportedMimeType';
  }
}

export function extractMediaRecorderError(event: Event): Error {
  const maybeError = (event as Event & { error?: unknown }).error;
  if (maybeError instanceof Error) {
    return maybeError;
  }
  if (
    typeof maybeError === 'object' &&
    maybeError !== null &&
    'message' in maybeError &&
    typeof (maybeError as { message: unknown }).message === 'string'
  ) {
    const name =
      'name' in maybeError && typeof (maybeError as { name: unknown }).name === 'string'
        ? (maybeError as { name: string }).name
        : 'Error';
    return new Error(`${name}: ${(maybeError as { message: string }).message}`);
  }
  if (maybeError !== undefined && maybeError !== null) {
    return new Error(String(maybeError));
  }
  return new Error('MediaRecorder error');
}

export interface StartMediaRecorderParams {
  recorder: MediaRecorder;
  timesliceMs?: number;
  onChunk: (chunk: Blob) => void;
  onCleanup: () => void;
  onAsyncError?: (error: Error) => void;
}

/**
 * MediaRecorder.start() の開始確定 (onstart) または失敗 (同期例外 / onerror / 開始前 onstop) を待つ。
 * 開始確定後に発生した非同期エラーは onAsyncError へ通知する。
 */
export function startMediaRecorderWithConfirmation(
  params: StartMediaRecorderParams
): Promise<void> {
  const { recorder, timesliceMs = 1000, onChunk, onCleanup, onAsyncError } = params;

  return new Promise<void>((resolve, reject) => {
    let started = false;
    let settled = false;

    const cleanup = () => {
      recorder.onstart = null;
      recorder.onerror = null;
      recorder.onstop = null;
      onCleanup();
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        onChunk(event.data);
      }
    };

    recorder.onstart = () => {
      started = true;
      if (!settled) {
        settled = true;
        recorder.onstop = null;
        resolve();
      }
    };

    recorder.onerror = (event) => {
      const error = extractMediaRecorderError(event);
      console.error('MediaRecorder error:', error);
      cleanup();
      if (!settled) {
        settled = true;
        reject(error);
      } else if (started) {
        onAsyncError?.(error);
      }
    };

    recorder.onstop = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('MediaRecorder stopped before starting.'));
      }
    };

    try {
      recorder.start(timesliceMs);
    } catch (err) {
      cleanup();
      if (!settled) {
        settled = true;
        reject(err);
      }
    }
  });
}

export interface StartOfflineSessionParams {
  capability: RecordingCapability;
  startRecording: () => Promise<void> | void;
  cleanupRecording: () => void;
  startTypingSession: () => void;
  formatUnavailableReason: (reason: RecordingUnavailableReason) => string;
  formatStartError: (rawMessage: string) => string;
  onError: (message: string) => void;
}

/**
 * offline モードの録画・セッション開始を調停する。
 * 録画不可または開始時の同期・非同期エラーでセッションを開始せず、失敗理由を通知する。
 */
export async function startOfflineSession(params: StartOfflineSessionParams): Promise<boolean> {
  const {
    capability,
    startRecording,
    cleanupRecording,
    startTypingSession,
    formatUnavailableReason,
    formatStartError,
    onError,
  } = params;

  if (!capability.available) {
    onError(formatUnavailableReason(capability.reason));
    return false;
  }

  try {
    await startRecording();
  } catch (err) {
    console.error('MediaRecorder start failed:', err);
    cleanupRecording();
    const rawReason = err instanceof Error ? err.message : String(err);
    onError(formatStartError(rawReason));
    return false;
  }

  startTypingSession();
  return true;
}

export function getVideoFileExtension(mimeType: string): 'webm' | 'mp4' | 'mov' {
  const normalizedType = mimeType.toLowerCase();
  if (normalizedType.includes('mp4')) return 'mp4';
  if (normalizedType.includes('quicktime')) return 'mov';
  return 'webm';
}
