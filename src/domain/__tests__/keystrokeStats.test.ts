import { describe, expect, it } from 'vitest';
import { summarizeKeystrokes } from '../keystrokeStats';
import type { KeystrokeLog } from '../../types/session';

const a = { timestamp: 1, key: 'a', code: 'KeyA' };
const b = { timestamp: 2, key: 'b', code: 'KeyB' };

describe('summarizeKeystrokes', () => {
  it('uses only judged keystrokes for accuracy and distance, and wrong keystrokes for habits', () => {
    const wrong: KeystrokeLog = {
      ...a, isCorrectFinger: false, distanceU: 1, expectedFinger: 'LeftPinky', predictedFinger: 'LeftIndex',
    };
    const stats = summarizeKeystrokes([
      { ...a, isCorrectFinger: true, distanceU: 0 },
      wrong,
      { ...a, distanceU: 2, expectedFinger: 'LeftPinky', predictedFinger: 'LeftIndex' },
      b,
    ]);

    expect(stats.accuracy).toBe(50);
    expect(stats.avgDistance).toBe(0.5);
    expect(stats.byCode).toEqual(new Map([
      ['KeyA', { correct: 1, wrong: 1, unknown: 1 }],
      ['KeyB', { correct: 0, wrong: 0, unknown: 1 }],
    ]));
    expect(stats.wrongKeystrokes).toEqual([wrong]);
  });

  it('leaves accuracy and distance unavailable for unknown-only sessions', () => {
    expect(summarizeKeystrokes([{ ...a, distanceU: 2 }, a])).toEqual({
      total: 2,
      judged: 0,
      accuracy: null,
      avgDistance: null,
      byCode: new Map([['KeyA', { correct: 0, wrong: 0, unknown: 2 }]]),
      wrongKeystrokes: [],
    });
  });

  it('returns empty counts and unavailable metrics for an empty session', () => {
    expect(summarizeKeystrokes([])).toEqual({
      total: 0,
      judged: 0,
      accuracy: null,
      avgDistance: null,
      byCode: new Map(),
      wrongKeystrokes: [],
    });
  });

  it('counts both correct and wrong keystrokes in coverage even without finite distances', () => {
    const stats = summarizeKeystrokes([
      { ...a, isCorrectFinger: true },
      { ...a, isCorrectFinger: false, distanceU: Infinity },
      a,
      b,
      b,
    ]);
    expect(stats.judged).toBe(2);
    expect(stats.total).toBe(5);
    expect(stats.avgDistance).toBeNull();
  });
});
