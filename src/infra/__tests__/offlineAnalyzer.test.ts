import { describe, expect, it, vi } from 'vitest';
import { runOfflineAnalysis } from '../offlineAnalyzer';
import { summarizeKeystrokes } from '../../domain/keystrokeStats';
import { parseKLE } from '../../utils/kleParser';
import { US_60_STANDARD_DATA } from '../../assets/layoutTemplates';
import type { CalibrationHomography } from '../../types/calibration';
import type { SessionData } from '../../types/session';

const IDENTITY_HOMOGRAPHY: CalibrationHomography = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

describe('runOfflineAnalysis', () => {
  it('marks all keystrokes as unknown without failing accuracy when blob is null', () => {
    const layout = parseKLE(US_60_STANDARD_DATA);
    const onComplete = vi.fn<(data: SessionData) => void>();
    const onProgress = vi.fn();

    runOfflineAnalysis({
      unanalyzedData: {
        blob: null,
        keystrokes: [
          { timestamp: 100, key: 'a', code: 'KeyA' },
          { timestamp: 200, key: 's', code: 'KeyS' },
        ],
        homography: IDENTITY_HOMOGRAPHY,
      },
      layout,
      worker: {} as Worker,
      video: {} as HTMLVideoElement,
      canvas: {} as HTMLCanvasElement,
      onProgress,
      onComplete,
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const sessionData = onComplete.mock.calls[0][0];
    expect(sessionData.frames).toEqual([]);
    expect(sessionData.keystrokes).toHaveLength(2);
    expect(sessionData.keystrokes.every((k) => k.isCorrectFinger === undefined)).toBe(true);

    const stats = summarizeKeystrokes(sessionData.keystrokes);
    expect(stats.total).toBe(2);
    expect(stats.judged).toBe(0);
    expect(stats.accuracy).toBeNull();
    expect(stats.avgDistance).toBeNull();
    expect(stats.wrongKeystrokes).toEqual([]);
    expect(stats.byCode.get('KeyA')).toEqual({ correct: 0, wrong: 0, unknown: 1 });
    expect(stats.byCode.get('KeyS')).toEqual({ correct: 0, wrong: 0, unknown: 1 });
  });
});
