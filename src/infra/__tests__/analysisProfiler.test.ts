import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// isAnalysisProfilingEnabled はモジュール読み込み時に import.meta.env を見て決まるため、
// テストごとに env をスタブしてからモジュールを読み直す。
async function loadProfiler(flag: string | undefined) {
  vi.resetModules();
  if (flag === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv('VITE_ANALYSIS_PROFILE', flag);
  }
  return import('../analysisProfiler');
}

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  return store;
}

describe('analysisProfiler', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installLocalStorageStub();
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('is a no-op when the flag is unset and never touches storage', async () => {
    const { createAnalysisProfiler, isAnalysisProfilingEnabled } = await loadProfiler(undefined);
    expect(isAnalysisProfilingEnabled).toBe(false);

    const profiler = createAnalysisProfiler();
    expect(profiler.enabled).toBe(false);
    profiler.count('frames.presented');
    profiler.add('inference.detectForVideo', 150);
    expect(profiler.measure('x', () => 42)).toBe(42);
    profiler.report('offline analysis');

    expect(store.size).toBe(0);
  });

  it('persists the report to localStorage so probe.html can read it back', async () => {
    const { createAnalysisProfiler, ANALYSIS_PROFILE_STORAGE_KEY } = await loadProfiler('1');

    const profiler = createAnalysisProfiler();
    expect(profiler.enabled).toBe(true);
    profiler.note('mediapipe.delegate', 'GPU');
    profiler.note('video.durationSec', 24.4);
    profiler.count('frames.presented', 3);
    profiler.count('frames.inferred');
    profiler.add('inference.detectForVideo', 150);
    profiler.add('inference.detectForVideo', 160);
    profiler.measure('finalize.exportSession', () => {});
    profiler.report('offline analysis');

    const raw = store.get(ANALYSIS_PROFILE_STORAGE_KEY);
    expect(raw).toBeDefined();
    const stored = JSON.parse(raw!);

    expect(stored.title).toBe('offline analysis');
    expect(typeof stored.savedAt).toBe('string');
    expect(stored.wallMs).toBeGreaterThanOrEqual(0);
    expect(stored.notes).toEqual({ 'mediapipe.delegate': 'GPU', 'video.durationSec': 24.4 });
    expect(stored.counters).toEqual({ 'frames.presented': 3, 'frames.inferred': 1 });
    expect(stored.timings['inference.detectForVideo']).toEqual({ totalMs: 310, calls: 2 });
    expect(stored.timings['finalize.exportSession'].calls).toBe(1);
  });

  it('still reports when localStorage is unavailable (worker-like context)', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    const { createAnalysisProfiler } = await loadProfiler('1');

    const profiler = createAnalysisProfiler();
    profiler.count('frames.presented');
    expect(() => profiler.report('offline analysis')).not.toThrow();
  });
});
