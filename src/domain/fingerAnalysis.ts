import type { Key, KeyboardLayout } from '../types/kle';
import type { Point } from '../types/geometry';
import { matchKLEKey, expectedFingerMap } from '../utils/keyMap';

/**
 * code に対応する物理キーをレイアウトから解決する。
 * 同一ラベル (ShiftLeft vs ShiftRight など) は X 座標で左右を判別する。
 */
export function findTargetKey(layout: KeyboardLayout, code: string): Key | null {
  const candidates = layout.keys.filter(k => matchKLEKey(k.label, code));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Resolve identical labels (like ShiftLeft vs ShiftRight) by X coordinate
  // Layout U coordinate: 0 is left, max is right.
  candidates.sort((a, b) => a.x - b.x);
  if (code.includes('Right')) {
    return candidates[candidates.length - 1]; // Rightmost key
  } else {
    return candidates[0]; // Leftmost key
  }
}

/**
 * 36キー級のコンパクトスプリット配列かどうかを判定するヒューリスティクス。
 */
function isCompactSplitLayout(layout: KeyboardLayout): boolean {
  return !!layout.isSplit && layout.keys.length <= 36 && layout.width <= 13;
}

/**
 * 期待指の判定。コンパクトスプリット配列の場合は列位置から指を推定し、
 * それ以外は標準タッチタイピングの expectedFingerMap を参照する。
 */
export function getExpectedFinger(
  layout: KeyboardLayout,
  code: string,
  targetKey: Key
): string | string[] {
  if (!isCompactSplitLayout(layout)) {
    return expectedFingerMap[code] || 'Unknown';
  }

  const centerX = targetKey.x + targetKey.w / 2;
  const centerY = targetKey.y + targetKey.h / 2;

  // 3x5+3 layouts place thumb keys below the three alpha rows.
  if (centerY >= 3) {
    return centerX < layout.width / 2 ? 'LeftThumb' : 'RightThumb';
  }

  if (centerX < layout.width / 2) {
    const col = Math.round(centerX - 0.5);
    return ['LeftPinky', 'LeftRing', 'LeftMiddle', 'LeftIndex', 'LeftIndex'][col] || 'LeftIndex';
  }

  const col = Math.round(centerX - 7.5);
  return ['RightIndex', 'RightIndex', 'RightMiddle', 'RightRing', 'RightPinky'][col] || 'RightIndex';
}

/** 1 キーストローク分の近接指解析結果。 */
export interface KeystrokeAnalysis {
  predictedFinger: string;
  expectedFinger: string | string[];
  isCorrectFinger?: boolean;
  distanceU: number;
}

/**
 * 1 キーストローク分の近接指解析。
 * targetKey がレイアウトに存在しなければ null を返す。
 *
 * キー中心と全指先の最短距離を求め、距離が 1.5U 以下なら期待指と照合する。
 * 距離が 1.5U を超える (指が離れている・マッピングが空) 場合は
 * isCorrectFinger を付与せずに predictedFinger と distanceU のみ返す。
 */
export function analyzeKeystrokeAgainstTips(
  layout: KeyboardLayout,
  code: string,
  mappedTips: Record<string, Point>
): KeystrokeAnalysis | null {
  const targetKey = findTargetKey(layout, code);
  if (!targetKey) return null;

  const keyCenter = {
    x: targetKey.x + targetKey.w / 2,
    y: targetKey.y + targetKey.h / 2
  };

  let bestFinger = '';
  let minDistance = Infinity;

  // Find the closest mapped finger tip across all 10 fingers
  for (const [fingerName, mappedTip] of Object.entries(mappedTips)) {
    const dist = Math.hypot(mappedTip.x - keyCenter.x, mappedTip.y - keyCenter.y);
    if (dist < minDistance) {
      minDistance = dist;
      bestFinger = fingerName;
    }
  }

  const expectedFinger = getExpectedFinger(layout, code, targetKey);

  // If no fingers mapped or distance is way too far (e.g. hands out of keyboard area)
  if (minDistance > 1.5) {
    return {
      predictedFinger: bestFinger || 'Unknown',
      expectedFinger,
      distanceU: minDistance
    };
  }

  let isCorrect: boolean;
  if (Array.isArray(expectedFinger)) {
    isCorrect = expectedFinger.includes(bestFinger);
  } else {
    isCorrect = expectedFinger === bestFinger;
  }

  return {
    predictedFinger: bestFinger,
    expectedFinger,
    isCorrectFinger: isCorrect,
    distanceU: minDistance
  };
}
