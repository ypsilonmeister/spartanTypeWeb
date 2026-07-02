import { describe, it, expect } from 'vitest';
import {
  landmarkToScreen,
  assignHandSidesByCameraX,
  pickOuterHands,
  applyCalibrationHomography,
} from '../handGeometry';
import type { HomographyMatrix } from '../../types/geometry';

type Hand = { landmarks: { x: number; y: number }[] };

/** 手首 (landmark 0) の正規化X座標だけを持つ手を作る。 */
function handAt(wristX: number): Hand {
  return { landmarks: [{ x: wristX, y: 0.5 }] };
}

describe('landmarkToScreen', () => {
  it('maps directly when mirror is off', () => {
    expect(landmarkToScreen({ x: 0.25, y: 0.5 }, 100, 200, false)).toEqual({ x: 25, y: 100 });
  });

  it('flips X when mirror is on', () => {
    expect(landmarkToScreen({ x: 0.25, y: 0.5 }, 100, 200, true)).toEqual({ x: 75, y: 100 });
  });
});

describe('assignHandSidesByCameraX', () => {
  it('assigns a single left-of-center hand to Left (no mirror)', () => {
    const h = handAt(0.2); // screenX = 20 < 50
    const sides = assignHandSidesByCameraX([h], 100, false);
    expect(sides.get(h)).toBe('Left');
  });

  it('assigns a single right-of-center hand to Right (no mirror)', () => {
    const h = handAt(0.8); // screenX = 80 >= 50
    const sides = assignHandSidesByCameraX([h], 100, false);
    expect(sides.get(h)).toBe('Right');
  });

  it('assigns leftmost=Left and rightmost=Right for two hands', () => {
    const left = handAt(0.2);
    const right = handAt(0.8);
    const sides = assignHandSidesByCameraX([right, left], 100, false);
    expect(sides.get(left)).toBe('Left');
    expect(sides.get(right)).toBe('Right');
  });

  it('swaps sides when mirror flips X ordering', () => {
    // Same two hands but mirrored: 0.2 -> 80, 0.8 -> 20.
    const a = handAt(0.2); // mirrored screenX = 80
    const b = handAt(0.8); // mirrored screenX = 20
    const sides = assignHandSidesByCameraX([a, b], 100, true);
    expect(sides.get(b)).toBe('Left');
    expect(sides.get(a)).toBe('Right');
  });
});

describe('pickOuterHands', () => {
  it('returns nulls for zero hands', () => {
    expect(pickOuterHands([], 100, false)).toEqual({ Left: null, Right: null });
  });

  it('assigns a single hand by center split', () => {
    const l = handAt(0.2);
    expect(pickOuterHands([l], 100, false)).toEqual({ Left: l, Right: null });
    const r = handAt(0.9);
    expect(pickOuterHands([r], 100, false)).toEqual({ Left: null, Right: r });
  });

  it('returns leftmost and rightmost for two hands', () => {
    const left = handAt(0.1);
    const right = handAt(0.9);
    expect(pickOuterHands([right, left], 100, false)).toEqual({ Left: left, Right: right });
  });
});

describe('applyCalibrationHomography', () => {
  const identity: HomographyMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // Translation by (+10, +20).
  const translate: HomographyMatrix = [1, 0, 10, 0, 1, 20, 0, 0, 1];

  it('applies a single matrix regardless of side', () => {
    const pt = { x: 3, y: 4 };
    expect(applyCalibrationHomography(identity, pt, 'Left')).toEqual({ x: 3, y: 4 });
    expect(applyCalibrationHomography(translate, pt, 'Right')).toEqual({ x: 13, y: 24 });
  });

  it('selects left matrix for Left and right matrix for Right in split form', () => {
    const split = { left: identity, right: translate, isSplit: true as const };
    const pt = { x: 5, y: 6 };
    expect(applyCalibrationHomography(split, pt, 'Left')).toEqual({ x: 5, y: 6 });
    expect(applyCalibrationHomography(split, pt, 'Right')).toEqual({ x: 15, y: 26 });
  });
});
