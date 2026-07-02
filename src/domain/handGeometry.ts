import type { Point, HomographyMatrix } from '../types/geometry';
import type { CalibrationHomography } from '../types/calibration';
import type { HandSide } from '../types/session';
import { applyHomography } from '../utils/homography';

export type { HandSide } from '../types/session';

/** 手のように扱える最小構造 (landmarks の x, y のみ参照)。 */
type HandLike = { landmarks: { x: number; y: number }[] };

/**
 * ランドマークをミラー補正込みで画面座標へ変換する。
 */
export function landmarkToScreen(
  landmark: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  mirror: boolean
): Point {
  return {
    x: (mirror ? 1 - landmark.x : landmark.x) * canvasWidth,
    y: landmark.y * canvasHeight
  };
}

/**
 * 各手の手首 (landmark 0) の画面X座標を計算し、昇順にソートした配列を返す共通ヘルパー。
 * 手首が存在しない場合は screenX=0 として扱う。
 */
function sortHandsByWristX<T extends HandLike>(
  hands: T[],
  canvasWidth: number,
  mirror: boolean
): { hand: T; screenX: number }[] {
  return hands
    .map((hand) => {
      const wrist = hand.landmarks[0];
      const screenX = wrist ? (mirror ? 1 - wrist.x : wrist.x) * canvasWidth : 0;
      return { hand, screenX };
    })
    .sort((a, b) => a.screenX - b.screenX);
}

/**
 * Use the same left/right rule as calibration: after mirror correction, the hand
 * on the left side of the camera frame maps to the left half of the keyboard.
 * MediaPipe handedness is often unreliable for top-down keyboard cameras.
 */
export function assignHandSidesByCameraX<T extends HandLike>(
  hands: T[],
  canvasWidth: number,
  mirror: boolean
): Map<T, HandSide> {
  const withX = sortHandsByWristX(hands, canvasWidth, mirror);

  const sides = new Map<T, HandSide>();
  if (withX.length === 0) return sides;

  if (withX.length === 1) {
    const single = withX[0];
    sides.set(single.hand, single.screenX < canvasWidth / 2 ? 'Left' : 'Right');
    return sides;
  }

  sides.set(withX[0].hand, 'Left');
  sides.set(withX[withX.length - 1].hand, 'Right');
  for (let i = 1; i < withX.length - 1; i++) {
    sides.set(withX[i].hand, withX[i].screenX < canvasWidth / 2 ? 'Left' : 'Right');
  }
  return sides;
}

/**
 * 検出された手をカメラ画面上のX位置で左右に割り当てる。
 *
 * 俯瞰カメラでは MediaPipe の handedness が不安定なため信頼しない。
 * 代わりに手の代表点 (手首 landmark 0) の画面X座標でソートし、
 * 左側の手 = ユーザーの左半分、右側の手 = 右半分として扱う。
 * (ホーム配置・コーナーとも両手を画面の左右に置く前提なので頑健。)
 *
 * @returns { Left, Right } いずれも検出されなければ null
 */
export function pickOuterHands<T extends HandLike>(
  hands: T[],
  canvasWidth: number,
  mirror: boolean
): { Left: T | null; Right: T | null } {
  const withX = sortHandsByWristX(hands, canvasWidth, mirror);

  if (withX.length === 0) return { Left: null, Right: null };
  if (withX.length === 1) {
    // 1手のみ: 画面中央より左なら左手とみなす
    const single = withX[0];
    return single.screenX < canvasWidth / 2
      ? { Left: single.hand, Right: null }
      : { Left: null, Right: single.hand };
  }
  return { Left: withX[0].hand, Right: withX[withX.length - 1].hand };
}

/**
 * Type guard: CalibrationHomography がスプリット形式かどうかを判定する。
 */
export function isSplitHomography(
  h: CalibrationHomography
): h is { left: HomographyMatrix; right: HomographyMatrix; isSplit: true } {
  return typeof h === 'object' && h !== null && 'isSplit' in h;
}

/**
 * CalibrationHomography を適用する共通ラッパー。
 * スプリット形式の場合、hand の左右に応じて対応するマトリクスを選択する。
 *
 * @param h - CalibrationHomography (単一または左右分割)
 * @param pt - 変換対象の点 (カメラ座標)
 * @param side - 'Left' | 'Right' (手の左右)
 * @returns 変換後の点 (レイアウト座標)
 */
export function applyCalibrationHomography(
  h: CalibrationHomography,
  pt: Point,
  side: 'Left' | 'Right'
): Point {
  if (isSplitHomography(h)) {
    return applyHomography(side === 'Left' ? h.left : h.right, pt);
  }
  return applyHomography(h as HomographyMatrix, pt);
}
