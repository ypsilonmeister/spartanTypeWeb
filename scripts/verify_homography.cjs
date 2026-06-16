// Gaussian elimination with partial pivoting
function solveLinearSystem(A, B) {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    A[i].push(B[i]);
  }

  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    const tmp = A[maxRow];
    A[maxRow] = A[i];
    A[i] = tmp;

    if (Math.abs(A[i][i]) < 1e-10) {
      throw new Error('Matrix is singular or nearly singular');
    }

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

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = A[i][n] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      A[k][n] -= A[k][i] * x[i];
    }
  }
  return x;
}

function computeHomography(src, dst) {
  if (src.length !== 4 || dst.length !== 4) return null;

  const A = [];
  const B = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);

    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }

  try {
    const h = solveLinearSystem(A, B);
    return [...h, 1];
  } catch (e) {
    console.error("Failed to compute homography matrix", e);
    return null;
  }
}

function applyHomography(matrix, pt) {
  const [h00, h01, h02, h10, h11, h12, h20, h21, h22] = matrix;
  const x = pt.x;
  const y = pt.y;

  const w = h20 * x + h21 * y + h22;
  const u = (h00 * x + h01 * y + h02) / w;
  const v = (h10 * x + h11 * y + h12) / w;

  return { x: u, y: v };
}

// Test Suite
console.log("=== Homography Math Engine Verification ===");

// 1. Identity transform check
const srcIdentity = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }
];
const dstIdentity = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }
];
const hIdentity = computeHomography(srcIdentity, dstIdentity);
console.log("1. Identity mapping calculation:");
console.log("   Matrix:", JSON.stringify(hIdentity));
const testPt = applyHomography(hIdentity, { x: 5, y: 2.5 });
console.log(`   Map (5, 2.5) -> (${testPt.x}, ${testPt.y}) [Expected: (5, 2.5)]`);
const errIdentity = Math.hypot(testPt.x - 5, testPt.y - 2.5);
console.log(`   Error: ${errIdentity.toFixed(10)} - ${errIdentity < 1e-9 ? 'PASS' : 'FAIL'}`);

// 2. Skewed perspective mapping (Webcam emulation)
// Camera captures trapezoid projection of the keyboard
const srcCamera = [
  { x: 120, y: 80 },   // Top-Left
  { x: 520, y: 80 },   // Top-Right
  { x: 580, y: 400 },  // Bottom-Right
  { x: 60, y: 400 }    // Bottom-Left
];
// Map to layout units (0 to 15.0 U wide, 0 to 5.0 U high)
const dstLayout = [
  { x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 5 }, { x: 0, y: 5 }
];
const hCamera = computeHomography(srcCamera, dstLayout);
console.log("\n2. Skewed perspective projection calculation (Camera -> Layout):");
console.log("   Matrix:", JSON.stringify(hCamera));

// Verify all 4 corners map back exactly
let maxError = 0;
for (let i = 0; i < 4; i++) {
  const mapped = applyHomography(hCamera, srcCamera[i]);
  const err = Math.hypot(mapped.x - dstLayout[i].x, mapped.y - dstLayout[i].y);
  console.log(`   Corner ${i}: Src (${srcCamera[i].x}, ${srcCamera[i].y}) -> Mapped (${mapped.x.toFixed(4)}, ${mapped.y.toFixed(4)}) vs Dest (${dstLayout[i].x}, ${dstLayout[i].y}) (Error: ${err.toFixed(10)})`);
  if (err > maxError) maxError = err;
}
console.log(`   Max Reprojection Error: ${maxError.toFixed(10)} - ${maxError < 1e-9 ? 'PASS' : 'FAIL'}`);

// 3. Degenerate points (Collinear points) - should fail gracefully
const srcCollinear = [
  { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 5 }
];
console.log("\n3. Degenerate collinear points check (Expected: Singular Matrix Error message):");
try {
  const hCollinear = computeHomography(srcCollinear, dstLayout);
  console.log(`   Result: ${hCollinear ? 'Calculated (Unexpected)' : 'Failed (Expected)'}`);
} catch (e) {
  console.log(`   Caught expected exception: ${e.message}`);
}
console.log("\n=== Math Verification Finished ===");
