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
