import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectRecordingCapability,
  evaluateRecordingCapability,
  getRecordingUnavailableTranslationKey,
  getVideoFileExtension,
  selectSupportedRecordingMimeType,
  startMediaRecorderWithConfirmation,
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

  it('falls back to browser default when no preferred mimeType is supported', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: true,
        isTypeSupported: () => false,
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: true });
  });

  it('falls back to browser default when isTypeSupported is missing', () => {
    expect(
      evaluateRecordingCapability({
        hasStream: true,
        hasMediaRecorder: true,
        hasCanvasCaptureStream: true,
      })
    ).toEqual({ available: true });
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

  it('falls back to browser default when MediaRecorder.isTypeSupported returns false', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => false) });
    const mockCanvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream, mockCanvas)).toEqual({
      available: true,
    });
  });

  it('falls back to browser default when MediaRecorder.isTypeSupported is missing', () => {
    vi.stubGlobal('MediaRecorder', {});
    const mockCanvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream, mockCanvas)).toEqual({
      available: true,
    });
  });

  it('reports no-canvas-capture-stream via HTMLCanvasElement.prototype when canvas arg is omitted', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'video/webm'),
    });
    vi.stubGlobal('HTMLCanvasElement', { prototype: {} });
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream)).toEqual({
      available: false,
      reason: 'no-canvas-capture-stream',
    });
  });

  it('reports no-canvas-capture-stream when HTMLCanvasElement is undefined and canvas arg is omitted', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'video/webm'),
    });
    vi.stubGlobal('HTMLCanvasElement', undefined);
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream)).toEqual({
      available: false,
      reason: 'no-canvas-capture-stream',
    });
  });

  it('detects availability via HTMLCanvasElement.prototype.captureStream when canvas arg is omitted', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((type: string) => type === 'video/webm'),
    });
    vi.stubGlobal('HTMLCanvasElement', { prototype: { captureStream: vi.fn() } });
    const mockStream = {} as MediaStream;

    expect(detectRecordingCapability(mockStream)).toEqual({
      available: true,
      mimeType: 'video/webm',
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

describe('startMediaRecorderWithConfirmation', () => {
  it('resolves when MediaRecorder fires start and forwards chunks', async () => {
    const chunks: Blob[] = [];
    const onCleanup = vi.fn();
    const onAsyncError = vi.fn();
    const mockRecorder = {
      ondataavailable: null as ((event: { data: Blob }) => void) | null,
      onstart: null as (() => void) | null,
      onerror: null as ((event: Event) => void) | null,
      onstop: null as (() => void) | null,
      start: vi.fn(() => {
        queueMicrotask(() => {
          mockRecorder.onstart?.();
          mockRecorder.ondataavailable?.({ data: new Blob(['chunk'], { type: 'video/webm' }) });
        });
      }),
    };

    await expect(
      startMediaRecorderWithConfirmation({
        recorder: mockRecorder as unknown as MediaRecorder,
        onChunk: (chunk) => chunks.push(chunk),
        onCleanup,
        onAsyncError,
      })
    ).resolves.toBeUndefined();

    expect(mockRecorder.start).toHaveBeenCalledWith(1000);
    expect(chunks).toHaveLength(1);
    expect(onCleanup).not.toHaveBeenCalled();
    expect(onAsyncError).not.toHaveBeenCalled();
  });

  it('rejects and cleans up when MediaRecorder fires error asynchronously before start', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCleanup = vi.fn();
    const onAsyncError = vi.fn();
    const mockRecorder = {
      ondataavailable: null as ((event: { data: Blob }) => void) | null,
      onstart: null as (() => void) | null,
      onerror: null as ((event: Event & { error?: unknown }) => void) | null,
      onstop: null as (() => void) | null,
      start: vi.fn(() => {
        queueMicrotask(() => {
          mockRecorder.onerror?.({
            error: new Error('NotSupportedError: codec unsupported'),
          } as unknown as Event & { error?: unknown });
        });
      }),
    };

    await expect(
      startMediaRecorderWithConfirmation({
        recorder: mockRecorder as unknown as MediaRecorder,
        onChunk: vi.fn(),
        onCleanup,
        onAsyncError,
      })
    ).rejects.toThrow('NotSupportedError: codec unsupported');

    expect(onCleanup).toHaveBeenCalledTimes(1);
    expect(onAsyncError).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('rejects and cleans up when MediaRecorder stops before firing start', async () => {
    const onCleanup = vi.fn();
    const mockRecorder = {
      ondataavailable: null as ((event: { data: Blob }) => void) | null,
      onstart: null as (() => void) | null,
      onerror: null as ((event: Event) => void) | null,
      onstop: null as (() => void) | null,
      start: vi.fn(() => {
        queueMicrotask(() => {
          mockRecorder.onstop?.();
        });
      }),
    };

    await expect(
      startMediaRecorderWithConfirmation({
        recorder: mockRecorder as unknown as MediaRecorder,
        onChunk: vi.fn(),
        onCleanup,
      })
    ).rejects.toThrow('MediaRecorder stopped before starting.');

    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('notifies onAsyncError and cleans up when error fires after start', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCleanup = vi.fn();
    const onAsyncError = vi.fn();
    const mockRecorder = {
      ondataavailable: null as ((event: { data: Blob }) => void) | null,
      onstart: null as (() => void) | null,
      onerror: null as ((event: Event & { error?: unknown }) => void) | null,
      onstop: null as (() => void) | null,
      start: vi.fn(() => {
        queueMicrotask(() => {
          mockRecorder.onstart?.();
        });
      }),
    };

    await startMediaRecorderWithConfirmation({
      recorder: mockRecorder as unknown as MediaRecorder,
      onChunk: vi.fn(),
      onCleanup,
      onAsyncError,
    });

    mockRecorder.onerror?.({
      error: new Error('EncodingError: encoder failed'),
    } as unknown as Event & { error?: unknown });

    expect(onCleanup).toHaveBeenCalledTimes(1);
    expect(onAsyncError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'EncodingError: encoder failed',
    }));
    consoleErrorSpy.mockRestore();
  });
});

describe('startOfflineSession', () => {
  it('does not start typing session when recording capability is unavailable', async () => {
    const startRecording = vi.fn();
    const cleanupRecording = vi.fn();
    const startTypingSession = vi.fn();
    const onError = vi.fn();

    const started = await startOfflineSession({
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

  it('does not start typing session and preserves raw error when startRecording throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const startRecording = vi.fn(() => {
      throw new Error('NotSupportedError: Failed to construct MediaRecorder');
    });
    const cleanupRecording = vi.fn();
    const startTypingSession = vi.fn();
    const onError = vi.fn();

    const started = await startOfflineSession({
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

  it('does not start typing session when startRecording rejects asynchronously', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events: string[] = [];
    const startRecording = vi.fn(async () => {
      await Promise.resolve();
      events.push('async-error');
      throw new Error('NotSupportedError: async failure');
    });
    const cleanupRecording = vi.fn(() => {
      events.push('cleanup');
    });
    const startTypingSession = vi.fn(() => {
      events.push('typing-started');
    });
    const onError = vi.fn((msg: string) => {
      events.push(`toast:${msg}`);
    });

    const started = await startOfflineSession({
      capability: { available: true },
      startRecording,
      cleanupRecording,
      startTypingSession,
      formatUnavailableReason: (reason) => reason,
      formatStartError: (raw) => `Failed: ${raw}`,
      onError,
    });

    expect(started).toBe(false);
    expect(startTypingSession).not.toHaveBeenCalled();
    expect(events).toEqual([
      'async-error',
      'cleanup',
      'toast:Failed: NotSupportedError: async failure',
    ]);
    consoleErrorSpy.mockRestore();
  });

  it('starts typing session only after startRecording resolves', async () => {
    const events: string[] = [];
    const startRecording = vi.fn(async () => {
      await Promise.resolve();
      events.push('recording-started');
    });
    const cleanupRecording = vi.fn();
    const startTypingSession = vi.fn(() => {
      events.push('typing-started');
    });
    const onError = vi.fn();

    const started = await startOfflineSession({
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
    expect(events).toEqual(['recording-started', 'typing-started']);
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

  it('provides en and ja translations for recordingStartFailed, recordingFailed, and noVideoCannotJudge', () => {
    expect(translations.en['trainer.recordingStartFailed']).toContain('{{reason}}');
    expect(translations.ja['trainer.recordingStartFailed']).toContain('{{reason}}');
    expect(translations.en['trainer.recordingFailed']).toContain('{{reason}}');
    expect(translations.ja['trainer.recordingFailed']).toContain('{{reason}}');
    expect(translations.en['dashboard.noVideoCannotJudge']).toBeTruthy();
    expect(translations.ja['dashboard.noVideoCannotJudge']).toBeTruthy();
  });
});
