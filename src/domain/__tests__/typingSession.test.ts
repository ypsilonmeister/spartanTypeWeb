import { describe, expect, it } from 'vitest';
import { TypingSession } from '../typingSession';
import { parseKLE } from '../../utils/kleParser';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import type { HandData } from '../../types/session';

const layout = parseKLE(LAYOUT_PRESETS['us-standard'].data, LAYOUT_PRESETS['us-standard'].isSplit);
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 手首 + 5 指先だけを持つ手。座標は正規化 (0..1)。 */
function handAt(baseX: number, baseY: number): HandData {
  const landmarks = Array.from({ length: 21 }, () => ({ x: baseX, y: baseY, z: 0 }));
  landmarks[4] = { x: baseX + 0.01, y: baseY, z: 0 };
  landmarks[8] = { x: baseX + 0.02, y: baseY, z: 0 };
  landmarks[12] = { x: baseX + 0.03, y: baseY, z: 0 };
  landmarks[16] = { x: baseX + 0.04, y: baseY, z: 0 };
  landmarks[20] = { x: baseX + 0.05, y: baseY, z: 0 };
  return { landmarks, handedness: 'Left' };
}

describe('TypingSession.mapHandsToTips', () => {
  it('maps fingertips through the homography without recording anything', () => {
    const session = new TypingSession(layout, identity);
    session.startSession();

    const { mappedTips, uiPointers } = session.mapHandsToTips([handAt(0.1, 0.5)], 1000, 500, false);

    // 単一の手は画面左半分にあるので Left。identity なので画素座標がそのまま出る。
    expect(mappedTips.LeftIndex).toEqual({ x: 120, y: 250 });
    expect(mappedTips.LeftPinky).toEqual({ x: 150, y: 250 });
    expect(uiPointers).toEqual([{ x: 120, y: 250 }]);
    expect(session.getFrames()).toHaveLength(0);
  });

  it('processFrame records exactly what mapHandsToTips computes', () => {
    const session = new TypingSession(layout, identity);
    session.startSession();
    const hands = [handAt(0.1, 0.5), handAt(0.7, 0.4)];

    const expected = session.mapHandsToTips(hands, 1000, 500, true);
    const pointers = session.processFrame(hands, 1234, 1000, 500, true);

    expect(pointers).toEqual(expected.uiPointers);
    expect(session.getFrames()).toEqual([{ timestamp: 1234, mappedTips: expected.mappedTips }]);
    // 鏡像では 0.7 の手が画面左 → Left、0.1 の手が Right
    expect(Object.keys(expected.mappedTips).sort()).toEqual([
      'LeftIndex', 'LeftMiddle', 'LeftPinky', 'LeftRing', 'LeftThumb',
      'RightIndex', 'RightMiddle', 'RightPinky', 'RightRing', 'RightThumb',
    ]);
  });
});
