import type { Point } from './geometry';
import type { ResolvedAnchor } from '../utils/calibrationAnchors';

export type CalibrationPhase = 'select' | 'home' | 'corners' | 'complete';

export interface CapturedPoint {
  anchor: ResolvedAnchor;
  camera: Point;
}
