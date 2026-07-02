import type { HomographyMatrix } from './geometry';

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
