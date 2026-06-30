import type { HomographyMatrix, Point } from './homography';
import { applyHomography } from './homography';

export type CalibrationHomography = 
  | HomographyMatrix 
  | { left: HomographyMatrix; right: HomographyMatrix; isSplit: true };

export interface CalibrationCameraSize {
  width: number;
  height: number;
}

export interface CalibrationConfig {
  layoutPresetId: string;
  homography: CalibrationHomography;
  cameraSize?: CalibrationCameraSize;
  customLayoutData?: unknown;
  customLayoutIsSplit?: boolean;
}

const STORAGE_KEY = 'spartan-calibration-config-v2';
const OLD_STORAGE_KEY = 'spartan-homography-v1';

/** Persist the calibration layout and homography to localStorage. */
export function saveCalibration(config: CalibrationConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save calibration config:', e);
  }
}

/** Load previously saved calibration config, fallback to old homography if present. */
export function loadCalibration(): CalibrationConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CalibrationConfig;
      if (parsed && typeof parsed.layoutPresetId === 'string' && parsed.homography) {
        return parsed;
      }
    }
    
    // Fallback to old format
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const parsedOld = JSON.parse(oldRaw);
      if (
        Array.isArray(parsedOld) &&
        parsedOld.length === 9 &&
        parsedOld.every((n) => typeof n === 'number' && isFinite(n))
      ) {
        return {
          layoutPresetId: 'us-standard',
          homography: parsedOld as HomographyMatrix
        };
      }
    }
    
    return null;
  } catch (e) {
    console.error('Failed to load calibration config:', e);
    return null;
  }
}

/**
 * Type guard: CalibrationHomography がスプリット形式かどうかを判定する。
 */
export function isSplitHomography(
  h: CalibrationHomography
): h is { left: HomographyMatrix; right: HomographyMatrix; isSplit: true } {
  return typeof h === 'object' && h !== null && 'isSplit' in h;
}

/**
 * CalibrationHomography を適用する共通ラッパー。
 * スプリット形式の場合、hand の左右に応じて対応するマトリクスを選択する。
 *
 * @param h - CalibrationHomography (単一または左右分割)
 * @param pt - 変換対象の点 (カメラ座標)
 * @param side - 'Left' | 'Right' (手の左右)
 * @returns 変換後の点 (レイアウト座標)
 */
export function applyCalibrationHomography(
  h: CalibrationHomography,
  pt: Point,
  side: 'Left' | 'Right'
): Point {
  if (isSplitHomography(h)) {
    return applyHomography(side === 'Left' ? h.left : h.right, pt);
  }
  return applyHomography(h as HomographyMatrix, pt);
}

/** Remove any saved calibration. */
export function clearCalibration(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OLD_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear calibration config:', e);
  }
}
