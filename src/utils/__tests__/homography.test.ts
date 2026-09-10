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

  // 3 点が一直線の退化配置。連立方程式は特異にならず解けてしまうが、
  // 返る H は階数落ち (det ≈ 0) で分母 w が点の間で符号反転する。
  // isValidHomography がこれを弾いて null を返す。
  it('rejects correspondences with three collinear points instead of returning a rank-deficient matrix', () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 5 },
    ];
    expect(computeHomographyLS(collinear, layoutRect)).toBeNull();
  });

  it('rejects four points that all lie on one line', () => {
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
      { x: 2, y: 1 },
      { x: 3, y: 1.5 },
    ];
    expect(computeHomographyLS(line, layoutRect)).toBeNull();
  });
});

/**
 * 退化検出が、実際のキャリブレーション配置を誤って弾かないことの保証。
 * ホーム行の 8 指は一直線に並ぶ (8 点が共線) が、コーナー 4 点が平面的広がりを
 * 与えるので系は正則で、有効な H が求まらなければならない。
 */
describe('validity check keeps real calibration layouts', () => {
  // 適当な射影で「カメラ画素」を合成する
  const cameraOf = (p: Point): Point => {
    const X = p.x * 40;
    const Y = p.y * 40;
    const w = 0.0008 * X + 0.0012 * Y + 1;
    return { x: (1.8 * X + 0.15 * Y + 100) / w, y: (0.05 * X + 1.6 * Y + 60) / w };
  };
  const homeRow: Point[] = [1.5, 2.5, 3.5, 4.5, 7.5, 8.5, 9.5, 10.5].map((x) => ({ x, y: 2.5 }));
  const corners: Point[] = [
    { x: 1.25, y: 1.5 },
    { x: 1.75, y: 3.5 },
    { x: 10.75, y: 1.5 },
    { x: 10.25, y: 3.5 },
  ];

  it('solves 8 collinear home-row fingers plus 4 corners', () => {
    const dst = [...homeRow, ...corners];
    const src = dst.map(cameraOf);
    const H = computeHomographyLS(src, dst);
    expect(H).not.toBeNull();
    expect(residual(H as number[], src, dst)).toBeLessThan(1e-6);
  });

  it('solves one hand of a split layout: 4 home-row fingers plus its 2 corners', () => {
    const dst = [...homeRow.slice(0, 4), corners[0], corners[1]];
    const src = dst.map(cameraOf);
    const H = computeHomographyLS(src, dst);
    expect(H).not.toBeNull();
    expect(residual(H as number[], src, dst)).toBeLessThan(1e-6);
  });

  it('rejects home-row fingers alone (no vertical spread)', () => {
    const dst = homeRow.slice(0, 4);
    expect(computeHomographyLS(dst.map(cameraOf), dst)).toBeNull();
  });
});
