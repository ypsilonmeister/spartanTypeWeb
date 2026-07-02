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
