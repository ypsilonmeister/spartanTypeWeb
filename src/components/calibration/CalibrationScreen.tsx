import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCameraSource } from '../../hooks/useCameraSource';
import type { CameraSource } from '../../hooks/useCameraSource';
import { parseKLE, parseLayoutJSON } from '../../utils/kleParser';
import { ToastContainer } from '../common/ToastContainer';
import type { Point } from '../../types/geometry';
import type { LayoutPresetId } from '../../assets/layoutTemplates';
import type { CalibrationCameraSize, CalibrationHomography } from '../../types/calibration';
import { useCalibrationCapture } from '../../hooks/useCalibrationCapture';
import { useToast } from '../../hooks/useToast';
import { useKeyboardLayout } from '../../hooks/useKeyboardLayout';
import { useLanguage } from '../../hooks/useLanguage';
import {
  useCalibrationHandRenderer,
  type CalibrationRawHand,
} from '../../hooks/useCalibrationHandRenderer';
import { CalibrationCameraPanel } from './CalibrationCameraPanel';
import { CalibrationInteractionPanel } from './CalibrationInteractionPanel';
import { CalibrationKeyboardGuide } from './CalibrationKeyboardGuide';
import '../../styles/cameraPreview.css';
import '../../styles/calibration.css';

interface CalibrationScreenProps {
  onComplete: (
    presetId: string,
    homography: CalibrationHomography,
    cameraSize?: CalibrationCameraSize,
    customLayoutData?: unknown,
    customLayoutIsSplit?: boolean
  ) => void;
  initialCustomLayoutData?: unknown | null;
  initialCustomLayoutIsSplit?: boolean;
}

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
  onComplete,
  initialCustomLayoutData = null,
  initialCustomLayoutIsSplit = false,
}) => {
  const { t } = useLanguage();
  const { toasts, showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraSource, setCameraSource] = useState<CameraSource>('local');
  const { error, isMirrored, remoteStatus, offer, submitAnswer, restartRemote } =
    useCameraSource(videoRef, cameraSource);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Layout selection
  const [presetId, setPresetId] = useState<LayoutPresetId | 'custom'>('us-standard');
  const [uploadedData, setUploadedData] = useState<unknown>(initialCustomLayoutData);
  const [uploadedIsSplit, setUploadedIsSplit] = useState<boolean>(initialCustomLayoutIsSplit);

  const activeLayout = useKeyboardLayout(presetId, uploadedData, uploadedIsSplit);
  const [previewPointers, setPreviewPointers] = useState<Point[]>([]);
  const latestHandsRef = useRef<CalibrationRawHand[]>([]);

  const {
    phase,
    cornerStep,
    cornerAnchors,
    captured,
    draggedPointIndex,
    computedHomography,
    highlightKeyIndices,
    homePointers,
    currentCorner,
    cornerInstruction,
    beginCalibration,
    handleCaptureHome,
    handleCaptureCorner,
    handleReset,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
  } = useCalibrationCapture({
    activeLayout,
    canvasRef,
    isMirrored,
    latestHandsRef,
    showToast,
    t,
  });

  useCalibrationHandRenderer({
    videoRef,
    canvasRef,
    isMirrored,
    phase,
    computedHomography,
    captured,
    draggedPointIndex,
    latestHandsRef,
    setPreviewPointers,
    setIsReady,
    setModelError,
  });

  const handlePhysicalKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (!isReady) return;
      if (phase === 'home') {
        e.preventDefault();
        handleCaptureHome();
      } else if (phase === 'corners') {
        e.preventDefault();
        handleCaptureCorner();
      }
    },
    [isReady, phase, handleCaptureHome, handleCaptureCorner]
  );

  useEffect(() => {
    window.addEventListener('keydown', handlePhysicalKeyPress);
    return () => window.removeEventListener('keydown', handlePhysicalKeyPress);
  }, [handlePhysicalKeyPress]);

  const handleStartCalibration = useCallback(() => {
    if (presetId === 'custom' && !uploadedData) {
      showToast(t('calibration.toast.needJson'), 'warning');
      return;
    }
    beginCalibration();
  }, [beginCalibration, presetId, uploadedData, showToast, t]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parseKLE(parsed, false);
          setUploadedData(parsed);
          setUploadedIsSplit(false);
          showToast(t('calibration.toast.kleLoaded'), 'success');
        } else if (
          parsed &&
          typeof parsed === 'object' &&
          'layout' in parsed &&
          Array.isArray(parsed.layout)
        ) {
          parseLayoutJSON(text, true);
          setUploadedData(parsed);
          setUploadedIsSplit(true);
          showToast(t('calibration.toast.vialLoaded'), 'success');
        } else {
          showToast(t('calibration.toast.unknownFormat'), 'error');
        }
      } catch (err) {
        showToast(
          t('calibration.toast.loadFailed') +
            (err instanceof Error ? err.message : String(err)),
          'error'
        );
      }
    };
    reader.readAsText(file);
  };

  const handleComplete = useCallback(() => {
    if (!computedHomography) return;
    const canvas = canvasRef.current;
    onComplete(
      presetId,
      computedHomography,
      canvas ? { width: canvas.width, height: canvas.height } : undefined,
      presetId === 'custom' && uploadedData ? uploadedData : undefined,
      presetId === 'custom' ? uploadedIsSplit : undefined
    );
  }, [computedHomography, onComplete, presetId, uploadedData, uploadedIsSplit]);

  return (
    <div className="calibration-screen">
      <div className="calibration-main-row">
        <CalibrationCameraPanel
          error={error}
          modelError={modelError}
          isReady={isReady}
          phase={phase}
          draggedPointIndex={draggedPointIndex}
          videoRef={videoRef}
          canvasRef={canvasRef}
          cameraSource={cameraSource}
          remoteStatus={remoteStatus}
          offer={offer}
          onCameraSourceChange={setCameraSource}
          onSubmitAnswer={submitAnswer}
          onRestartRemote={restartRemote}
          onCanvasMouseDown={handleCanvasMouseDown}
          onCanvasMouseMove={handleCanvasMouseMove}
          onCanvasMouseUp={handleCanvasMouseUp}
          onCanvasMouseLeave={handleCanvasMouseLeave}
        />

        <CalibrationInteractionPanel
          phase={phase}
          presetId={presetId}
          uploadedData={uploadedData}
          uploadedIsSplit={uploadedIsSplit}
          cornerStep={cornerStep}
          cornerAnchorsLength={cornerAnchors.length}
          currentCorner={currentCorner}
          cornerInstruction={cornerInstruction}
          onPresetChange={setPresetId}
          onUploadedIsSplitChange={setUploadedIsSplit}
          onFileUpload={handleFileUpload}
          onStartCalibration={handleStartCalibration}
          onCaptureHome={handleCaptureHome}
          onCaptureCorner={handleCaptureCorner}
          onComplete={handleComplete}
          onReset={handleReset}
        />
      </div>
      <CalibrationKeyboardGuide
        layout={activeLayout}
        highlightKeyIndices={highlightKeyIndices}
        previewPointers={previewPointers}
        homePointers={homePointers}
      />
      <ToastContainer toasts={toasts} />
    </div>
  );
};
