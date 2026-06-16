import type { HomographyMatrix } from './homography';

const STORAGE_KEY = 'spartan-homography-v1';

/** Persist the calibration homography matrix to localStorage. */
export function saveHomography(matrix: HomographyMatrix): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
  } catch (e) {
    console.error('Failed to save calibration:', e);
  }
}

/** Load a previously saved homography matrix, or null if none/invalid. */
export function loadHomography(): HomographyMatrix | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 9 &&
      parsed.every((n) => typeof n === 'number' && isFinite(n))
    ) {
      return parsed as HomographyMatrix;
    }
    return null;
  } catch (e) {
    console.error('Failed to load calibration:', e);
    return null;
  }
}

/** Remove any saved calibration. */
export function clearHomography(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear calibration:', e);
  }
}
