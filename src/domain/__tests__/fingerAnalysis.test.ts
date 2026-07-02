import { describe, it, expect } from 'vitest';
import {
  findTargetKey,
  getExpectedFinger,
  analyzeKeystrokeAgainstTips,
} from '../fingerAnalysis';
import { parseKLE } from '../../utils/kleParser';
import { US_60_STANDARD_DATA, SPLIT_36_DATA } from '../../assets/layoutTemplates';
import type { Point } from '../../types/geometry';

const standard = parseKLE(US_60_STANDARD_DATA, false);
const split36 = parseKLE(SPLIT_36_DATA, true);

describe('findTargetKey', () => {
  it('resolves a normal alpha key', () => {
    const key = findTargetKey(standard, 'KeyF');
    expect(key).not.toBeNull();
    expect(key?.label.toLowerCase()).toContain('f');
  });

  it('returns null for a code absent from the layout', () => {
    expect(findTargetKey(split36, 'Digit1')).toBeNull();
  });

  it('distinguishes ShiftLeft (leftmost) from ShiftRight (rightmost) by X', () => {
    const left = findTargetKey(standard, 'ShiftLeft');
    const right = findTargetKey(standard, 'ShiftRight');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    // Both labelled "Shift"; left one must sit further left than the right one.
    expect((left as { x: number }).x).toBeLessThan((right as { x: number }).x);
  });
});

describe('getExpectedFinger', () => {
  it('uses the standard expectedFingerMap for non-compact layouts', () => {
    const key = findTargetKey(standard, 'KeyF')!;
    expect(getExpectedFinger(standard, 'KeyF', key)).toBe('LeftIndex');
    const jKey = findTargetKey(standard, 'KeyJ')!;
    expect(getExpectedFinger(standard, 'KeyJ', jKey)).toBe('RightIndex');
  });

  it('maps columns to fingers on a 36-key compact split layout', () => {
    const q = findTargetKey(split36, 'KeyQ')!; // leftmost column
    expect(getExpectedFinger(split36, 'KeyQ', q)).toBe('LeftPinky');

    const p = findTargetKey(split36, 'KeyP')!; // rightmost column
    expect(getExpectedFinger(split36, 'KeyP', p)).toBe('RightPinky');

    const h = findTargetKey(split36, 'KeyH')!; // right inner index column
    expect(getExpectedFinger(split36, 'KeyH', h)).toBe('RightIndex');
  });

  it('maps the thumb row to thumbs on the compact split layout', () => {
    const space = findTargetKey(split36, 'Space')!;
    // Space sits on the left half of the thumb row.
    expect(getExpectedFinger(split36, 'Space', space)).toBe('LeftThumb');
  });
});

describe('analyzeKeystrokeAgainstTips', () => {
  it('returns null when the key is absent from the layout', () => {
    expect(analyzeKeystrokeAgainstTips(split36, 'Digit1', {})).toBeNull();
  });

  it('picks the nearest finger and confirms a correct finger within 1.5U', () => {
    const fKey = findTargetKey(standard, 'KeyF')!;
    const center = { x: fKey.x + fKey.w / 2, y: fKey.y + fKey.h / 2 };
    const tips: Record<string, Point> = {
      LeftIndex: { x: center.x + 0.1, y: center.y },
      RightPinky: { x: center.x + 10, y: center.y },
    };
    const result = analyzeKeystrokeAgainstTips(standard, 'KeyF', tips);
    expect(result).not.toBeNull();
    expect(result?.predictedFinger).toBe('LeftIndex');
    expect(result?.isCorrectFinger).toBe(true);
    expect(result?.distanceU).toBeCloseTo(0.1, 5);
  });

  it('leaves isCorrectFinger undefined when nearest tip is farther than 1.5U', () => {
    const fKey = findTargetKey(standard, 'KeyF')!;
    const center = { x: fKey.x + fKey.w / 2, y: fKey.y + fKey.h / 2 };
    const tips: Record<string, Point> = {
      LeftIndex: { x: center.x + 5, y: center.y },
    };
    const result = analyzeKeystrokeAgainstTips(standard, 'KeyF', tips);
    expect(result).not.toBeNull();
    expect(result?.predictedFinger).toBe('LeftIndex');
    expect('isCorrectFinger' in (result as object)).toBe(false);
    expect(result?.distanceU).toBeCloseTo(5, 5);
  });

  it('falls into the >1.5U branch with Unknown predicted finger when no tips are mapped', () => {
    const result = analyzeKeystrokeAgainstTips(standard, 'KeyF', {});
    expect(result).not.toBeNull();
    expect(result?.predictedFinger).toBe('Unknown');
    expect('isCorrectFinger' in (result as object)).toBe(false);
    expect(result?.distanceU).toBe(Infinity);
  });

  it('uses includes() when the expected finger is an array (Space -> either thumb)', () => {
    const spaceKey = findTargetKey(standard, 'Space')!;
    const center = { x: spaceKey.x + spaceKey.w / 2, y: spaceKey.y + spaceKey.h / 2 };
    const tips: Record<string, Point> = {
      RightThumb: { x: center.x, y: center.y },
    };
    const result = analyzeKeystrokeAgainstTips(standard, 'Space', tips);
    expect(result?.expectedFinger).toEqual(['LeftThumb', 'RightThumb']);
    expect(result?.predictedFinger).toBe('RightThumb');
    expect(result?.isCorrectFinger).toBe(true);
  });
});
