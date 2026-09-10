import { describe, expect, it } from 'vitest';
import {
  cropRectForHand,
  expectedHandForKeystroke,
  otherHand,
  uncropHands,
} from '../frameCrop';
import { landmarkToScreen } from '../handGeometry';
import { parseKLE } from '../../utils/kleParser';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';

const usStandard = parseKLE(LAYOUT_PRESETS['us-standard'].data, LAYOUT_PRESETS['us-standard'].isSplit);
const split36 = parseKLE(LAYOUT_PRESETS['split-36'].data, LAYOUT_PRESETS['split-36'].isSplit);

describe('expectedHandForKeystroke', () => {
  it('reads the hand off the standard finger map', () => {
    expect(expectedHandForKeystroke(usStandard, 'KeyA')).toBe('Left');
    expect(expectedHandForKeystroke(usStandard, 'KeyJ')).toBe('Right');
  });

  it('uses the column heuristic on compact split layouts', () => {
    expect(expectedHandForKeystroke(split36, 'KeyA')).toBe('Left');
    expect(expectedHandForKeystroke(split36, 'KeyL')).toBe('Right');
  });

  it('returns null for keys that are not on the layout', () => {
    expect(expectedHandForKeystroke(usStandard, 'F24')).toBeNull();
  });

  it('flips sides with otherHand', () => {
    expect(otherHand('Left')).toBe('Right');
    expect(otherHand('Right')).toBe('Left');
  });
});

describe('cropRectForHand', () => {
  it('puts the left hand on the raw left when the frame is not mirrored', () => {
    expect(cropRectForHand('Left', false, 1000, 500, 0.5)).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(cropRectForHand('Right', false, 1000, 500, 0.5)).toEqual({ x: 500, y: 0, width: 500, height: 500 });
  });

  it('swaps sides when the frame is mirrored, matching landmarkToScreen', () => {
    // 鏡像では画面左 (Left) は生フレームの右側
    expect(cropRectForHand('Left', true, 1000, 500, 0.5)).toEqual({ x: 500, y: 0, width: 500, height: 500 });
    expect(cropRectForHand('Right', true, 1000, 500, 0.5)).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it('overlaps the centre line by the requested margin', () => {
    const rect = cropRectForHand('Right', false, 1000, 500, 0.6);
    expect(rect).toEqual({ x: 400, y: 0, width: 600, height: 500 });
  });

  it('clamps the ratio to the frame', () => {
    expect(cropRectForHand('Left', false, 1000, 500, 1.5).width).toBe(1000);
    expect(cropRectForHand('Left', false, 1000, 500, 0).width).toBe(1);
  });
});

describe('uncropHands', () => {
  it('maps crop-normalised landmarks back to frame-normalised ones', () => {
    const rect = { x: 400, y: 0, width: 600, height: 500 };
    const [hand] = uncropHands(
      [{ landmarks: [{ x: 0, y: 0, z: 0.1 }, { x: 1, y: 1, z: 0.2 }, { x: 0.5, y: 0.5, z: 0.3 }] }],
      rect,
      1000,
      500
    );
    expect(hand.landmarks[0]).toEqual({ x: 0.4, y: 0, z: 0.1 });
    expect(hand.landmarks[1]).toEqual({ x: 1, y: 1, z: 0.2 });
    expect(hand.landmarks[2]).toEqual({ x: 0.7, y: 0.5, z: 0.3 });
  });

  it('lands the wrist on the correct half of the screen after mirror correction', () => {
    // 鏡像フレーム、右手 → 生フレームの左側を切り出し。切り出し内で中央にある手首は、
    // 元フレームでは x=0.3 → 画面 x = (1 - 0.3) × W = 右半分 → assignHandSidesByCameraX で Right
    const rect = cropRectForHand('Right', true, 1000, 500, 0.6);
    const [hand] = uncropHands([{ landmarks: [{ x: 0.5, y: 0.5 }] }], rect, 1000, 500);
    const screen = landmarkToScreen(hand.landmarks[0], 1000, 500, true);
    expect(screen.x).toBeGreaterThan(500);
  });

  it('keeps other hand fields untouched', () => {
    const [hand] = uncropHands(
      [{ handedness: 'Left' as const, landmarks: [{ x: 0.5, y: 0.5, z: 0 }] }],
      { x: 0, y: 0, width: 100, height: 100 },
      100,
      100
    );
    expect(hand.handedness).toBe('Left');
  });
});
