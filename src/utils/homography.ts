export interface Point {
  x: number;
  y: number;
}

export type HomographyMatrix = number[]; // 9 elements (3x3 row-major)

/**
 * Solves Ax = B using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  // Augment A with B
  for (let i = 0; i < n; i++) {
    A[i].push(B[i]);
  }

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    const tmp = A[maxRow];
    A[maxRow] = A[i];
    A[i] = tmp;

    // Check for singular matrix
    if (Math.abs(A[i][i]) < 1e-10) {
      throw new Error('Matrix is singular or nearly singular');
    }

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n + 1; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
    }
  }

  // Solve equation Ax=B for an upper triangular matrix A
  const x: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = A[i][n] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      A[k][n] -= A[k][i] * x[i];
    }
  }
  return x;
}

/**
 * Computes the Homography matrix mapping src points to dst points.
 * Requires exactly 4 point correspondences.
 *
 * @param src Array of 4 Point objects (e.g., Camera pixel coordinates)
 * @param dst Array of 4 Point objects (e.g., Virtual Keyboard logical coordinates)
 * @returns 9-element array representing the 3x3 homography matrix (row-major), or null if failed
 */
export function computeHomography(src: Point[], dst: Point[]): HomographyMatrix | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];

    // DLT formulation
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);

    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }

  try {
    const h = solveLinearSystem(A, B);
    // Append the scale factor h33 = 1
    return [...h, 1];
  } catch (e) {
    console.error("Failed to compute homography matrix", e);
    return null;
  }
}

/** 3x3 行列 (row-major 9要素) の積 A·B。 */
function mat3Mul(A: number[], B: number[]): number[] {
  const C = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
      }
    }
  }
  return C;
}

/** 3x3 行列の逆行列。特異なら null。 */
function mat3Inverse(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-15) return null;
  const id = 1 / det;
  return [
    (e * i - f * h) * id,
    (c * h - b * i) * id,
    (b * f - c * e) * id,
    (f * g - d * i) * id,
    (a * i - c * g) * id,
    (c * d - a * f) * id,
    (d * h - e * g) * id,
    (b * g - a * h) * id,
    (a * e - b * d) * id,
  ];
}

/**
 * Hartley 正規化行列を作る。点群を重心原点・平均距離 √2 にスケールする
 * 相似変換 T を返し、正規化後の点も返す。
 *
 * これを掛けてから DLT を解くことで、正規方程式の悪条件 (横一行に
 * 近い配置など) による解の暴れを劇的に抑える。
 */
function normalizationTransform(pts: Point[]): { T: number[]; normalized: Point[] } {
  const n = pts.length;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let meanDist = 0;
  for (const p of pts) meanDist += Math.hypot(p.x - mx, p.y - my);
  meanDist /= n;

  const s = meanDist > 1e-12 ? Math.SQRT2 / meanDist : 1;
  // T = scale(s) · translate(-mx, -my)
  const T = [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
  const normalized = pts.map((p) => ({ x: s * (p.x - mx), y: s * (p.y - my) }));
  return { T, normalized };
}

/**
 * Computes a homography from N >= 4 point correspondences using least squares.
 *
 * 4点ぴったりなら computeHomography と同等の解になるが、5点以上を渡すと
 * 過剰決定系を最小二乗で解く。入力は Hartley 正規化してから DLT を解くため、
 * ホーム1行＋縦アンカーのような平面的広がりに乏しい配置でも安定する。
 * キャリブレーションでホーム8指 + コーナー(QZP/) を集約して使う。
 *
 * @param src カメラ画素座標の配列 (>= 4)
 * @param dst 対応する KLE 論理座標の配列 (>= 4, src と同数)
 * @returns 9要素の3x3行列 (row-major) または失敗時 null
 */
export function computeHomographyLS(src: Point[], dst: Point[]): HomographyMatrix | null {
  if (src.length !== dst.length || src.length < 4) return null;

  // 座標正規化 (悪条件対策)
  const { T: Ts, normalized: srcN } = normalizationTransform(src);
  const { T: Td, normalized: dstN } = normalizationTransform(dst);

  // 8 unknowns (h33 = 1 と固定)。各対応点が 2 本の方程式を与える。
  const rows: number[][] = [];
  const rhs: number[] = [];

  for (let i = 0; i < srcN.length; i++) {
    const { x, y } = srcN[i];
    const { x: u, y: v } = dstN[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }

  // Normal equations: (AᵀA) h = Aᵀb  →  8x8 の対称正定値系
  const n = 8;
  const ata: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const atb: number[] = new Array<number>(n).fill(0);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const b = rhs[r];
    for (let i = 0; i < n; i++) {
      atb[i] += row[i] * b;
      for (let j = 0; j < n; j++) {
        ata[i][j] += row[i] * row[j];
      }
    }
  }

  try {
    const h = solveLinearSystem(ata, atb);
    const Hn = [...h, 1]; // 正規化空間でのホモグラフィ

    // 元の座標系へ戻す: H = Td⁻¹ · Hn · Ts
    const TdInv = mat3Inverse(Td);
    if (!TdInv) return null;
    const H = mat3Mul(TdInv, mat3Mul(Hn, Ts));

    // h33 = 1 に再正規化
    if (Math.abs(H[8]) < 1e-15) return null;
    const scale = 1 / H[8];
    return H.map((v) => v * scale);
  } catch (e) {
    console.error('Failed to compute least-squares homography', e);
    return null;
  }
}

/**
 * Applies a 3x3 homography matrix to a 2D point.
 *
 * @param matrix 3x3 Homography matrix (length 9 array)
 * @param pt Point to transform
 * @returns Transformed point
 */
export function applyHomography(matrix: HomographyMatrix, pt: Point): Point {
  const [h00, h01, h02, h10, h11, h12, h20, h21, h22] = matrix;
  const x = pt.x;
  const y = pt.y;

  const w = h20 * x + h21 * y + h22;
  const u = (h00 * x + h01 * y + h02) / w;
  const v = (h10 * x + h11 * y + h12) / w;

  return { x: u, y: v };
}
