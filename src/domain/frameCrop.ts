/**
 * 「期待する手」だけを推論するためのフレーム切り出し。
 *
 * 打鍵ごとに期待指 (= 期待する手) は分かっているので、その手が写っている側だけを
 * 切り出して numHands: 1 で推論すれば、landmark モデルを 2 回走らせずに済む
 * (実測で推論 150〜190ms/frame のうち 35〜40% を占める)。
 *
 * ランドマークは切り出し画像に対する正規化座標で返ってくるため、既存の座標変換
 * (handGeometry.landmarkToScreen → ホモグラフィ) に渡す前に元フレーム基準へ戻す。
 * ここは純関数のみ。DOM も MediaPipe も知らない。
 */
import type { KeyboardLayout } from '../types/kle';
import type { HandSide } from '../types/session';
import { findTargetKey, getExpectedFinger } from './fingerAnalysis';

/** 画像内の矩形 (ピクセル、左上原点)。 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type LandmarkLike = { x: number; y: number };
type HandLike = { landmarks: LandmarkLike[] };

/**
 * 打鍵に期待される手。期待指が両手にまたがる (配列) 場合は先頭を採用する。
 * レイアウトにキーが無い、または期待指が 'Unknown' なら null。
 */
export function expectedHandForKeystroke(layout: KeyboardLayout, code: string): HandSide | null {
  const key = findTargetKey(layout, code);
  if (!key) return null;

  const finger = getExpectedFinger(layout, code, key);
  const name = Array.isArray(finger) ? finger[0] : finger;
  if (typeof name !== 'string') return null;
  if (name.startsWith('Left')) return 'Left';
  if (name.startsWith('Right')) return 'Right';
  return null;
}

export function otherHand(side: HandSide): HandSide {
  return side === 'Left' ? 'Right' : 'Left';
}

/**
 * 期待する手が写っている側の矩形。
 *
 * handGeometry.landmarkToScreen と同じ規約に従う: 画面 x = (mirror ? 1 - lx : lx) × W。
 * つまり画面上の「左」(Left) は、mirror のとき生フレームでは右側にある。
 *
 * @param widthRatio 矩形幅 / フレーム幅。0.5 でちょうど半分、0.6 なら中央線を 10% 越えて
 *                   中央付近のキーで手が境界にまたがるのを避ける。
 */
export function cropRectForHand(
  side: HandSide,
  mirror: boolean,
  frameWidth: number,
  frameHeight: number,
  widthRatio = 0.6
): CropRect {
  const ratio = Math.min(1, Math.max(0, widthRatio));
  const width = Math.max(1, Math.round(frameWidth * ratio));
  const onRawLeft = (side === 'Left') !== mirror;
  return {
    x: onRawLeft ? 0 : frameWidth - width,
    y: 0,
    width,
    height: frameHeight,
  };
}

/**
 * 切り出し画像に対する正規化ランドマーク (0..1) を、元フレームに対する正規化座標へ戻す。
 * z は相対深度なのでそのまま。
 */
export function uncropHands<T extends HandLike>(
  hands: T[],
  rect: CropRect,
  frameWidth: number,
  frameHeight: number
): T[] {
  return hands.map((hand) => ({
    ...hand,
    landmarks: hand.landmarks.map((landmark) => ({
      ...landmark,
      x: (rect.x + landmark.x * rect.width) / frameWidth,
      y: (rect.y + landmark.y * rect.height) / frameHeight,
    })),
  }));
}
