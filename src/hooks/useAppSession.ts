import { useCallback, useMemo, useReducer } from 'react';
import type { LayoutPresetId } from '../assets/layoutTemplates';
import { useKeyboardLayout } from './useKeyboardLayout';
import { loadCalibration, saveCalibration } from '../utils/calibrationStorage';
import type { CalibrationCameraSize, CalibrationHomography } from '../types/calibration';
import type { SessionData, UnanalyzedSessionData } from '../types/session';

export type AppMode = 'calibration' | 'trainer' | 'dashboard';

interface AppSessionState {
  layoutPresetId: LayoutPresetId | 'custom';
  homography: CalibrationHomography | null;
  calibrationCameraSize?: CalibrationCameraSize;
  mode: AppMode;
  unanalyzedData: UnanalyzedSessionData | null;
  analyzedData: SessionData | null;
  recordingBlob: Blob | null;
  customLayoutData: unknown | null;
  customLayoutIsSplit: boolean;
}

interface CalibrationCompletePayload {
  presetId: string;
  calibration: CalibrationHomography;
  cameraSize?: CalibrationCameraSize;
  customData?: unknown;
  customIsSplit?: boolean;
}

type AppSessionAction =
  | { type: 'showCalibration' }
  | { type: 'showTrainer' }
  | { type: 'showDashboard' }
  | { type: 'calibrationComplete'; payload: CalibrationCompletePayload }
  | { type: 'sessionComplete'; payload: UnanalyzedSessionData | SessionData }
  | { type: 'analysisComplete'; payload: SessionData }
  | { type: 'sessionLoaded'; payload: SessionData };

function createInitialState(): AppSessionState {
  const savedConfig = loadCalibration();

  return {
    layoutPresetId: savedConfig ? (savedConfig.layoutPresetId as LayoutPresetId | 'custom') : 'us-standard',
    homography: savedConfig ? savedConfig.homography : null,
    calibrationCameraSize: savedConfig?.cameraSize,
    mode: savedConfig ? 'trainer' : 'calibration',
    unanalyzedData: null,
    analyzedData: null,
    recordingBlob: null,
    customLayoutData: savedConfig?.customLayoutData || null,
    customLayoutIsSplit: savedConfig?.customLayoutIsSplit || false,
  };
}

function reducer(state: AppSessionState, action: AppSessionAction): AppSessionState {
  switch (action.type) {
    case 'showCalibration':
      return {
        ...state,
        unanalyzedData: null,
        analyzedData: null,
        recordingBlob: null,
        mode: 'calibration',
      };
    case 'showTrainer':
      if (!state.homography) return state;
      return {
        ...state,
        unanalyzedData: null,
        analyzedData: null,
        recordingBlob: null,
        mode: 'trainer',
      };
    case 'showDashboard':
      return {
        ...state,
        mode: 'dashboard',
      };
    case 'calibrationComplete':
      return {
        ...state,
        layoutPresetId: action.payload.presetId as LayoutPresetId | 'custom',
        homography: action.payload.calibration,
        calibrationCameraSize: action.payload.cameraSize,
        customLayoutData:
          action.payload.customData !== undefined
            ? action.payload.customData
            : state.customLayoutData,
        customLayoutIsSplit:
          action.payload.customIsSplit !== undefined
            ? action.payload.customIsSplit
            : state.customLayoutIsSplit,
        unanalyzedData: null,
        analyzedData: null,
        recordingBlob: null,
        mode: 'trainer',
      };
    case 'sessionComplete':
      if ('frames' in action.payload) {
        return {
          ...state,
          analyzedData: action.payload,
          unanalyzedData: null,
          recordingBlob: null,
          mode: 'dashboard',
        };
      }

      return {
        ...state,
        unanalyzedData: action.payload,
        analyzedData: null,
        recordingBlob: action.payload.blob,
        mode: 'dashboard',
      };
    case 'analysisComplete':
      return {
        ...state,
        analyzedData: action.payload,
        unanalyzedData: null,
        mode: 'dashboard',
      };
    case 'sessionLoaded':
      return {
        ...state,
        analyzedData: action.payload,
        unanalyzedData: null,
        recordingBlob: null,
        mode: 'dashboard',
      };
    default:
      return state;
  }
}

export function useAppSession() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const layout = useKeyboardLayout(
    state.layoutPresetId,
    state.customLayoutData,
    state.customLayoutIsSplit
  );

  const handleCalibrationComplete = useCallback((
    presetId: string,
    calibration: CalibrationHomography,
    cameraSize?: CalibrationCameraSize,
    customData?: unknown,
    customIsSplit?: boolean
  ) => {
    saveCalibration({
      layoutPresetId: presetId,
      homography: calibration,
      cameraSize,
      customLayoutData: customData,
      customLayoutIsSplit: customIsSplit,
    });
    dispatch({
      type: 'calibrationComplete',
      payload: { presetId, calibration, cameraSize, customData, customIsSplit },
    });
  }, []);

  const actions = useMemo(() => ({
    showCalibration: () => dispatch({ type: 'showCalibration' }),
    showTrainer: () => dispatch({ type: 'showTrainer' }),
    showDashboard: () => dispatch({ type: 'showDashboard' }),
    handleCalibrationComplete,
    handleSessionComplete: (data: UnanalyzedSessionData | SessionData) => {
      dispatch({ type: 'sessionComplete', payload: data });
    },
    handleAnalysisComplete: (data: SessionData) => {
      dispatch({ type: 'analysisComplete', payload: data });
    },
    handleSessionLoaded: (data: SessionData) => {
      dispatch({ type: 'sessionLoaded', payload: data });
    },
  }), [handleCalibrationComplete]);

  return {
    ...state,
    layout,
    actions,
  };
}
