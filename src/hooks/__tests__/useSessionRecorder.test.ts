import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  useEffect: () => {},
  useRef: <T>(initialValue: T) => ({ current: initialValue }),
}));

import { useSessionRecorder } from '../useSessionRecorder';

interface MockMediaRecorderInstance {
  state: 'inactive' | 'recording' | 'paused';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstart: (() => void) | null;
  onerror: ((event: Event & { error?: unknown }) => void) | null;
  onstop: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

describe('useSessionRecorder', () => {
  let latestRecorder: MockMediaRecorderInstance | null = null;
  let trackStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    latestRecorder = null;
    trackStop = vi.fn();

    class MockMediaRecorder implements MockMediaRecorderInstance {
      static isTypeSupported = vi.fn(() => true);
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      mimeType = 'video/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstart: (() => void) | null = null;
      onerror: ((event: Event & { error?: unknown }) => void) | null = null;
      onstop: (() => void) | null = null;
      start = vi.fn(() => {
        this.state = 'recording';
        queueMicrotask(() => {
          this.onstart?.();
        });
      });
      stop = vi.fn();

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        if (options?.mimeType) {
          this.mimeType = options.mimeType;
        }
        registerRecorder(this);
      }
    }

    const registerRecorder = (instance: MockMediaRecorderInstance) => {
      latestRecorder = instance;
    };

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function useSetupRecorder() {
    const videoRef = {
      current: {
        videoWidth: 640,
        videoHeight: 480,
        readyState: 2,
      } as unknown as HTMLVideoElement,
    };

    const hook = useSessionRecorder({ videoRef });
    (hook.recordingCanvasRef as { current: HTMLCanvasElement | null }).current = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      captureStream: vi.fn(() => ({
        getTracks: () => [{ stop: trackStop }],
      })),
    } as unknown as HTMLCanvasElement;

    return hook;
  }

  it('resolves with recorded Blob on normal stop', async () => {
    const { startOfflineRecording, stopOfflineRecording } = useSetupRecorder();
    await startOfflineRecording();

    latestRecorder!.stop = vi.fn(() => {
      latestRecorder!.state = 'inactive';
      latestRecorder!.ondataavailable?.({ data: new Blob(['frame'], { type: 'video/webm' }) });
      latestRecorder!.onstop?.();
    });

    const blob = await stopOfflineRecording();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.size).toBeGreaterThan(0);
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it('settles stopOfflineRecording when error fires after stop is requested (error -> dataavailable -> stop)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onAsyncError = vi.fn();
    const { startOfflineRecording, stopOfflineRecording } = useSetupRecorder();
    await startOfflineRecording(onAsyncError);

    latestRecorder!.stop = vi.fn(() => {
      queueMicrotask(() => {
        latestRecorder!.onerror?.({
          error: new Error('EncodingError: stop failed'),
        } as unknown as Event & { error?: unknown });
        latestRecorder!.ondataavailable?.({ data: new Blob(['partial'], { type: 'video/webm' }) });
        latestRecorder!.state = 'inactive';
        latestRecorder!.onstop?.();
      });
    });

    const stopPromise = stopOfflineRecording();
    const result = await Promise.race([
      stopPromise.then((blob) => ({ status: 'settled' as const, blob })),
      new Promise<{ status: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ status: 'timeout' }), 100)
      ),
    ]);

    expect(result.status).toBe('settled');
    if (result.status === 'settled') {
      expect(result.blob).toBeNull();
    }
    expect(onAsyncError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'EncodingError: stop failed' })
    );
    expect(trackStop).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('settles stopOfflineRecording with null and cleans up when recorder.stop() throws', async () => {
    const { startOfflineRecording, stopOfflineRecording } = useSetupRecorder();
    await startOfflineRecording();

    latestRecorder!.stop = vi.fn(() => {
      throw new Error('InvalidStateError: cannot stop');
    });

    const blob = await stopOfflineRecording();
    expect(blob).toBeNull();
    expect(trackStop).toHaveBeenCalledTimes(1);
  });
});
