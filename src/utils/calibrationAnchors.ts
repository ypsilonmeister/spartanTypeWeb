import type { KeyboardLayout, Key } from '../types/kle';
import type { Point } from './homography';

/**
 * キャリブレーションの新方式 (配列選択 + ホームポジション + コーナー) で使う
 * 「指 → キー」の対応定義。
 *
 * 設計の要点:
 * - 配列の種類 (row-staggered / column-staggered / split) の違いは、選択された
 *   KLE データが各キーの正しい (x, y) を持っているため、ここでアンカーキーの
 *   論理座標を引くだけで自動的に反映される。明示的な配列タイプ分岐は不要。
 * - ホーム8指 (FDSA / JKL;) と縦アンカー (Q,Z / P,/) を集約し、
 *   computeHomographyLS で過剰決定系を最小二乗で解く。
 */

/** MediaPipe HandLandmarker の指先ランドマーク index。 */
export const FINGERTIP_LANDMARK = {
  Thumb: 4,
  Index: 8,
  Middle: 12,
  Ring: 16,
  Pinky: 20,
} as const;

export type FingerName = keyof typeof FINGERTIP_LANDMARK;
export type HandSide = 'Left' | 'Right';

/** ひとつのアンカーキー (どの手のどの指でどのキーを押さえるか)。 */
export interface AnchorSpec {
  /** KLE ラベル小文字での検索キー (例: 'f', ';', '/')。 */
  searchLabel: string;
  /** 標準タッチタイピングでそのキーを担当する手。 */
  hand: HandSide;
  /** 担当する指 (指先ランドマーク選択に使用)。 */
  finger: FingerName;
  /** UI 表示用ラベル。 */
  display: string;
}

/** ホームポジション8指。左右それぞれ 小指→人差し指の順。 */
export const HOME_ANCHORS: AnchorSpec[] = [
  { searchLabel: 'a', hand: 'Left', finger: 'Pinky', display: 'A' },
  { searchLabel: 's', hand: 'Left', finger: 'Ring', display: 'S' },
  { searchLabel: 'd', hand: 'Left', finger: 'Middle', display: 'D' },
  { searchLabel: 'f', hand: 'Left', finger: 'Index', display: 'F' },
  { searchLabel: 'j', hand: 'Right', finger: 'Index', display: 'J' },
  { searchLabel: 'k', hand: 'Right', finger: 'Middle', display: 'K' },
  { searchLabel: 'l', hand: 'Right', finger: 'Ring', display: 'L' },
  { searchLabel: ';', hand: 'Right', finger: 'Pinky', display: ';' },
];

/** 左コーナー: 左手小指で Q(上), Z(下)。縦方向アンカー。 */
export const LEFT_CORNER_ANCHORS: AnchorSpec[] = [
  { searchLabel: 'q', hand: 'Left', finger: 'Pinky', display: 'Q' },
  { searchLabel: 'z', hand: 'Left', finger: 'Pinky', display: 'Z' },
];

/** 右コーナー: 右手小指で P(上), /(下)。縦方向アンカー。 */
export const RIGHT_CORNER_ANCHORS: AnchorSpec[] = [
  { searchLabel: 'p', hand: 'Right', finger: 'Pinky', display: 'P' },
  { searchLabel: '/', hand: 'Right', finger: 'Pinky', display: '/' },
];

/** KLE レイアウトからラベル一致するキーを探し、その中心の論理座標を返す。 */
export function findKeyCenter(layout: KeyboardLayout, searchLabel: string): Point | null {
  const target = searchLabel.toLowerCase();
  let found: Key | undefined = layout.keys.find((k) =>
    k.label.toLowerCase().split('\n').includes(target)
  );
  if (!found) {
    // フォールバック: 部分一致 (記号キーで legend が複合の場合に拾う)
    found = layout.keys.find((k) => k.label.toLowerCase().includes(target));
  }
  if (!found) return null;
  return { x: found.x + found.w / 2, y: found.y + found.h / 2 };
}

export interface ResolvedAnchor extends AnchorSpec {
  /** KLE 論理座標 (見つからなければ null)。 */
  target: Point | null;
}

/** アンカー定義群をレイアウトに解決し、KLE 座標を付与する。 */
export function resolveAnchors(layout: KeyboardLayout, specs: AnchorSpec[]): ResolvedAnchor[] {
  return specs.map((spec) => ({ ...spec, target: findKeyCenter(layout, spec.searchLabel) }));
}
