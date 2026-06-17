import type { HomographyMatrix } from './homography';

export type CalibrationHomography = 
  | HomographyMatrix 
  | { left: HomographyMatrix; right: HomographyMatrix; isSplit: true };

export interface CalibrationConfig {
  layoutPresetId: string;
  homography: CalibrationHomography;
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

/** Remove any saved calibration. */
export function clearCalibration(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OLD_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear calibration config:', e);
  }
}
