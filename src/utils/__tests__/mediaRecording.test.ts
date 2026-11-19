import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectRecordingCapability,
  evaluateRecordingCapability,
  getRecordingUnavailableTranslationKey,
  getVideoFileExtension,
  selectSupportedRecordingMimeType,
  startOfflineSession,
  type RecordingUnavailableReason,
} from '../mediaRecording';
import { translations } from '../../i18n/translations';

describe('selectSupportedRecordingMimeType', () => {
  it('prefers WebM when the browser supports it', () => {
    const isTypeSupported = vi.fn((type: string) => (
      type === 'video/webm;codecs=vp8' || type === 'video/mp4'
    ));

    expect(selectSupportedRecordingMimeType(isTypeSupported)).toBe('video/webm;codecs=vp8');
  });

  it('falls back to MP4 when WebM recording is unsupported', () => {
    const isTypeSupported = vi.fn((type: string) => type === 'video/mp4');

    expect(selectSupportedRecordingMimeType(isTypeSupported)).toBe('video/mp4');
  });

  it('lets the browser choose when none of the preferred types is supported', () => {
    expect(selectSupportedRecordingMimeType(() => false)).toBeUndefined();
  });
});

describe('getVideoFileExtension', () => {
  it.each([
    ['video/webm;codecs=vp8', 'webm'],
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/quicktime', 'mov'],
  ])('maps %s to .%s', (mimeType, extension) => {
    expect(getVideoFileExtension(mimeType)).toBe(extension);
  });
});

describe('evaluateRecordingCapability', () => {
  it('returns available with the preferred mimeType when all requirements are met', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: true,
        isTypeSupported: (type) => type === 'video/webm;codecs=vp8',
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: true, mimeType: 'video/webm;codecs=vp8' });
  });

  it('reports no-media-recorder when MediaRecorder is undefined', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: false,
        isTypeSupported: () => true,
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: false, reason: 'no-media-recorder' });
  });

  it('reports no-canvas-capture-stream when canvas.captureStream is unavailable', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: true,
        isTypeSupported: () => true,
        hasCanvasCaptureStream: false,
      })
    ).toEqual({ available: false, reason: 'no-canvas-capture-stream' });
  });

  it('reports unsupported-mime-type when no preferred mimeType is supported', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: true,
        isTypeSupported: () => false,
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: false, reason: 'unsupported-mime-type' });
  });

  it('reports unsupported-mime-type when isTypeSupported is missing', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: true,
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: false, reason: 'unsupported-mime-type' });
  });

  it('reports no-stream when camera stream is null', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: false,
        hasMediaRecorder: true,
        isTypeSupported: () => true,
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: false, reason: 'no-stream' });
  });
});

describe('detectRecordingCapability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports no-media-recorder when global MediaRecorder is undefined', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const mockCanvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream, mockCanvas)).toEqual({
      available: false,
      reason: 'no-media-recorder',
    });
  });

  it('reports unsupported-mime-type when MediaRecorder.isTypeSupported returns false', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => false) });
    const mockCanvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream, mockCanvas)).toEqual({
      available: false,
      reason: 'unsupported-mime-type',
    });
  });

  it('reports no-stream when stream is null', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'video/webm'),
    });
    const mockCanvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;

    expect(detectRecordingCapability(null, mockCanvas)).toEqual({
      available: false,
      reason: 'no-stream',
    });
  });

  it('returns available when MediaRecorder, captureStream, mimeType, and stream are present', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'video/webm;codecs=vp9'),
    });
    const mockCanvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream, mockCanvas)).toEqual({
      available: true,
      mimeType: 'video/webm;codecs=vp9',
    });
  });
});

describe('startOfflineSession', () => {
  it('does not start typing session when recording capability is unavailable', () => {
    const startRecording = vi.fn();
    const cleanupRecording = vi.fn();
    const startTypingSession = vi.fn();
    const onError = vi.fn();

    const started = startOfflineSession({
      capability: { available: false, reason: 'no-stream' },
      startRecording,
      cleanupRecording,
      startTypingSession,
      formatUnavailableReason: (reason) => `unavailable:${reason}`,
      formatStartError: (raw) => `error:${raw}`,
      onError,
    });

    expect(started).toBe(false);
    expect(startRecording).not.toHaveBeenCalled();
    expect(startTypingSession).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('unavailable:no-stream');
  });

  it('does not start typing session and preserves raw error when startRecording throws', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const startRecording = vi.fn(() => {
      throw new Error('NotSupportedError: Failed to construct MediaRecorder');
    });
    const cleanupRecording = vi.fn();
    const startTypingSession = vi.fn();
    const onError = vi.fn();

    const started = startOfflineSession({
      capability: { available: true, mimeType: 'video/webm;codecs=vp8' },
      startRecording,
      cleanupRecording,
      startTypingSession,
      formatUnavailableReason: (reason) => reason,
      formatStartError: (raw) => `Failed: ${raw}`,
      onError,
    });

    expect(started).toBe(false);
    expect(cleanupRecording).toHaveBeenCalledTimes(1);
    expect(startTypingSession).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Failed: NotSupportedError: Failed to construct MediaRecorder'
    );
    consoleErrorSpy.mockRestore();
  });

  it('starts typing session when recording starts successfully', () => {
    const startRecording = vi.fn();
    const cleanupRecording = vi.fn();
    const startTypingSession = vi.fn();
    const onError = vi.fn();

    const started = startOfflineSession({
      capability: { available: true, mimeType: 'video/webm;codecs=vp8' },
      startRecording,
      cleanupRecording,
      startTypingSession,
      formatUnavailableReason: (reason) => reason,
      formatStartError: (raw) => raw,
      onError,
    });

    expect(started).toBe(true);
    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(cleanupRecording).not.toHaveBeenCalled();
    expect(startTypingSession).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('recording i18n keys', () => {
  const reasons: RecordingUnavailableReason[] = [
    'no-stream',
    'no-media-recorder',
    'no-canvas-capture-stream',
    'unsupported-mime-type',
  ];

  it.each(reasons)('provides en and ja translations for %s', (reason) => {
    const key = getRecordingUnavailableTranslationKey(reason);
    expect(translations.en[key]).toBeTruthy();
    expect(translations.ja[key]).toBeTruthy();
  });

  it('provides en and ja translations for recordingStartFailed and noVideoCannotJudge', () => {
    expect(translations.en['trainer.recordingStartFailed']).toContain('{{reason}}');
    expect(translations.ja['trainer.recordingStartFailed']).toContain('{{reason}}');
    expect(translations.en['dashboard.noVideoCannotJudge']).toBeTruthy();
    expect(translations.ja['dashboard.noVideoCannotJudge']).toBeTruthy();
  });
});
