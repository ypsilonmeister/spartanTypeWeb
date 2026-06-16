# Verify Homography Math Skill (`/spartan-custom:verify-homography`)

This skill validates the mathematical mapping and projection algorithms in `homography.ts` by executing a direct projective transform test suite.

## Purpose
Ensures that the direct linear transformation (DLT) solver is functional, computes correct coefficients for perspective projection mapping (representing webcam angles), maps boundaries correctly, and throws singular errors when collinear coordinates are input.

## Instructions

1. **Run the Verification Script**:
   - Propose a command to run `node scripts/verify_homography.cjs` in the workspace using the `run_command` tool.

2. **Evaluate the Console Output**:
   - Verify that the output prints:
     - `Error: 0.0000000000 - PASS` for the identity mapping test.
     - `Max Reprojection Error: <very small number> - PASS` for the camera-to-layout skewed trapezoid projection test.
     - `Matrix is singular or nearly singular` under the degenerate collinear check.
   - If any test output prints `FAIL`, mathematical calculation issues are present in `src/utils/homography.ts` and must be investigated.

3. **Report Status**:
   - Provide a brief summary of the calculated re-projection errors and confirm mathematical accuracy to the developer.
