import { describe, it, expect } from 'vitest';
import { computeHomographyLS, applyHomography } from '../homography';
import type { Point } from '../../types/geometry';

/** 行列を点群へ適用したときの残差二乗和。 */
function residual(matrix: number[], src: Point[], dst: Point[]): number {
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyHomography(matrix, src[i]);
    sum += (p.x - dst[i].x) ** 2 + (p.y - dst[i].y) ** 2;
  }
  return sum;
}

describe('applyHomography', () => {
  it('applies an identity matrix as a no-op', () => {
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(applyHomography(id, { x: 3, y: 7 })).toEqual({ x: 3, y: 7 });
  });

  it('applies a translation matrix', () => {
    const t = [1, 0, 5, 0, 1, -2, 0, 0, 1];
    expect(applyHomography(t, { x: 1, y: 1 })).toEqual({ x: 6, y: -1 });
  });
});

describe('computeHomographyLS', () => {
  it('returns null when fewer than 4 correspondences are given', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(computeHomographyLS(pts, pts)).toBeNull();
  });

  it('recovers a near-identity mapping from 4 identical correspondences', () => {
    const src: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
      { x: 4, y: 3 },
    ];
    const dst = src;
    const H = computeHomographyLS(src, dst);
    expect(H).not.toBeNull();
    expect(residual(H as number[], src, dst)).toBeLessThan(1e-6);
  });

  it('recovers a translation from 4 corresponding points', () => {
    const src: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 5 },
      { x: 5, y: 5 },
    ];
    const dst = src.map((p) => ({ x: p.x + 10, y: p.y - 3 }));
    const H = computeHomographyLS(src, dst);
    expect(H).not.toBeNull();
    expect(residual(H as number[], src, dst)).toBeLessThan(1e-6);
    // Spot-check a fresh interior point.
    const mapped = applyHomography(H as number[], { x: 2, y: 4 });
    expect(mapped.x).toBeCloseTo(12, 6);
    expect(mapped.y).toBeCloseTo(1, 6);
  });

  it('solves an over-determined system (8 points, affine map) with tiny residual', () => {
    // Affine: scale by 2 in X, 3 in Y, translate (+1, +2).
    const affine = (p: Point): Point => ({ x: 2 * p.x + 1, y: 3 * p.y + 2 });
    const src: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 3, y: 3 },
      { x: 1, y: 4 },
      { x: 4, y: 1 },
      { x: 2, y: 5 },
    ];
    const dst = src.map(affine);
    const H = computeHomographyLS(src, dst);
    expect(H).not.toBeNull();
    expect(residual(H as number[], src, dst)).toBeLessThan(1e-6);
  });
});

/**
 * scripts/verify_homography.cjs の検証内容を Vitest に取り込んだ回帰ゲート。
 * スクリプトは手で走らせないと気づけないが、ここに置けば npm test で毎回検査される。
 */
describe('regression gate ported from scripts/verify_homography.cjs', () => {
  // Webcam が捉えるキーボードの台形 (画素) → レイアウト座標 (U)。
  // アフィンでは表せない純粋な射影なので、LS 解法の本質をここで固定する。
  const cameraTrapezoid: Point[] = [
    { x: 120, y: 80 },   // 左上
    { x: 520, y: 80 },   // 右上
    { x: 580, y: 400 },  // 右下
    { x: 60, y: 400 },   // 左下
  ];
  const layoutRect: Point[] = [
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 5 },
    { x: 0, y: 5 },
  ];

  it('maps a skewed webcam trapezoid onto the layout rectangle with negligible corner error', () => {
    const H = computeHomographyLS(cameraTrapezoid, layoutRect);
    expect(H).not.toBeNull();

    let maxCornerError = 0;
    for (let i = 0; i < 4; i++) {
      const mapped = applyHomography(H as number[], cameraTrapezoid[i]);
      maxCornerError = Math.max(
        maxCornerError,
        Math.hypot(mapped.x - layoutRect[i].x, mapped.y - layoutRect[i].y)
      );
    }
    expect(maxCornerError).toBeLessThan(1e-9);
  });

  it('keeps the perspective: the pixel centre of the trapezoid lands inside the layout, below its mid-line', () => {
    const H = computeHomographyLS(cameraTrapezoid, layoutRect) as number[];
    // 台形は下辺が広いので、画素中心はレイアウトでは中央より下に写る。
    const centre = applyHomography(H, { x: 320, y: 240 });
    expect(centre.x).toBeCloseTo(7.5, 6);
    expect(centre.y).toBeGreaterThan(2.5);
    expect(centre.y).toBeLessThan(5);
  });

  // 既知の穴: 3 点が一直線に並ぶ退化配置では連立方程式が特異になるが、
  // 現行の LS 実装は null を返さず、要素が 1e15 級の行列を返してしまう。
  // (旧 verify_homography.cjs の厳密解法は特異行列を検出して失敗していた。)
  // 修正されてこのテストが通り始めたら it.fails を it に戻すこと。
  it.fails('rejects collinear correspondences instead of returning an ill-conditioned matrix', () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 5 },
    ];
    expect(computeHomographyLS(collinear, layoutRect)).toBeNull();
  });
});
