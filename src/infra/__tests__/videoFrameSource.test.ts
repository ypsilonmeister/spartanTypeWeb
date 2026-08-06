import { describe, expect, it } from 'vitest';
import { calculatePlaybackProgress } from '../videoFrameSource';

describe('calculatePlaybackProgress', () => {
  it('uses the recorded session duration when WebM metadata duration is infinite', () => {
    expect(calculatePlaybackProgress(5, Infinity, 10)).toBe(50);
  });

  it('prefers a valid metadata duration', () => {
    expect(calculatePlaybackProgress(5, 20, 10)).toBe(25);
  });

  it('clamps progress to the visible bar range', () => {
    expect(calculatePlaybackProgress(12, Infinity, 10)).toBe(100);
    expect(calculatePlaybackProgress(-1, Infinity, 10)).toBe(0);
  });

  it('stays at zero when neither duration is available', () => {
    expect(calculatePlaybackProgress(5, Number.NaN)).toBe(0);
  });
});
