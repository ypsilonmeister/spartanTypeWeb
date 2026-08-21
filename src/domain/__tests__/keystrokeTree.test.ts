import { describe, expect, it } from 'vitest';
import { buildKeystrokeTreeView } from '../keystrokeTree';
import type { KeystrokeLog } from '../../types/session';

function stroke(
  key: string,
  expectedFinger: string,
  isCorrectFinger?: boolean
): KeystrokeLog {
  return {
    timestamp: 0,
    key,
    code: `Key${key.toUpperCase()}`,
    expectedFinger,
    predictedFinger: isCorrectFinger === false ? 'LeftIndex' : expectedFinger,
    isCorrectFinger,
  };
}

describe('buildKeystrokeTreeView', () => {
  it('returns null when there is nothing to grow', () => {
    expect(buildKeystrokeTreeView([])).toBeNull();
  });

  it('nests keystrokes as hand ➔ finger ➔ key', () => {
    const view = buildKeystrokeTreeView([
      stroke('a', 'LeftPinky', true),
      stroke('j', 'RightIndex', true),
    ])!;

    expect(view.children.map(c => c.label)).toEqual(['Left', 'Right']);
    expect(view.children[0].children.map(c => c.label)).toEqual(['Pinky']);
    expect(view.children[0].children[0].children.map(c => c.label)).toEqual(['a']);
  });

  it('orders fingers thumb ➔ pinky rather than by first appearance', () => {
    const view = buildKeystrokeTreeView([
      stroke('a', 'LeftPinky', true),
      stroke('f', 'LeftIndex', true),
      stroke(' ', 'LeftThumb', true),
    ])!;

    expect(view.children[0].children.map(c => c.label)).toEqual([
      'Thumb',
      'Index',
      'Pinky',
    ]);
  });

  it('weighs a branch by how often the finger was used', () => {
    const view = buildKeystrokeTreeView([
      stroke('a', 'LeftPinky', true),
      stroke('a', 'LeftPinky', true),
      stroke('a', 'LeftPinky', true),
      stroke('j', 'RightIndex', true),
    ])!;

    expect(view.children.map(c => c.weight)).toEqual([3, 1]);
  });

  it('grows a key only as far as the right finger reached it', () => {
    const view = buildKeystrokeTreeView([
      stroke('a', 'LeftPinky', true),
      stroke('a', 'LeftPinky', false),
      stroke('a', 'LeftPinky', false),
      stroke('a', 'LeftPinky', false),
    ])!;

    const key = view.children[0].children[0].children[0];
    expect(key.progress).toBeCloseTo(0.25);
    expect(key.damage).toBeCloseTo(0.75);
    expect(key.reps).toBe(4);
  });

  it('treats unscored keystrokes as neutral rather than as mistakes', () => {
    const view = buildKeystrokeTreeView([stroke('a', 'LeftPinky'), stroke('s', 'LeftRing')])!;

    expect(view.progress).toBe(1);
    expect(view.damage).toBe(0);
  });

  it('parks keystrokes with no finger analysis under Unknown', () => {
    const view = buildKeystrokeTreeView([
      { timestamp: 0, key: 'a', code: 'KeyA' },
      stroke('j', 'RightIndex', true),
    ])!;

    expect(view.children.map(c => c.label)).toEqual(['Right', 'Unknown']);
  });

  it('rolls accuracy up the tree weighted by usage', () => {
    const view = buildKeystrokeTreeView([
      stroke('a', 'LeftPinky', true),
      stroke('a', 'LeftPinky', true),
      stroke('a', 'LeftPinky', true),
      stroke('j', 'RightIndex', false),
    ])!;

    // Three clean presses against one bad one.
    expect(view.progress).toBeCloseTo(0.75);
    expect(view.damage).toBeCloseTo(0.25);
  });
});
