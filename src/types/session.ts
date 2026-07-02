import type { Point } from './geometry';
import type { CalibrationHomography, CalibrationCameraSize } from './calibration';

export type HandSide = 'Left' | 'Right';

export interface HandData {
  landmarks: { x: number, y: number, z: number, visibility?: number }[];
  handedness: HandSide;
}

export interface FrameLog {
  timestamp: number;
  mappedTips: Record<string, Point>; // e.g. { 'LeftThumb': {x,y}, 'RightIndex': {x,y} }
}

export interface KeystrokeLog {
  timestamp: number;
  key: string;
  code: string;
  predictedFinger?: string;
  expectedFinger?: string | string[];
  isCorrectFinger?: boolean;
  distanceU?: number;
}

export interface SessionData {
  homography: CalibrationHomography;
  calibrationCameraSize?: CalibrationCameraSize;
  frames: FrameLog[];
  keystrokes: KeystrokeLog[];
}

export interface UnanalyzedSessionData {
  blob: Blob | null;
  keystrokes: KeystrokeLog[];
  homography: CalibrationHomography;
  calibrationCameraSize?: CalibrationCameraSize;
  isMirrored?: boolean;
}
