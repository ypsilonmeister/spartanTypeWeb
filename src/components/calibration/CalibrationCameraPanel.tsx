import type React from 'react';
import { CameraSourceSelector } from '../camera/CameraSourceSelector';
import type { CameraSource, RemoteStatus } from '../../hooks/useCameraSource';
import type { CalibrationPhase } from '../../types/calibrationFlow';

interface CalibrationCameraPanelProps {
  error: string | null;
  modelError: string | null;
  isReady: boolean;
  phase: CalibrationPhase;
  draggedPointIndex: number | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraSource: CameraSource;
  remoteStatus: RemoteStatus;
  offer: string | null;
  onCameraSourceChange: (source: CameraSource) => void;
  onSubmitAnswer: (answer: string) => void;
  onRestartRemote: () => void;
  onCanvasMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onCanvasMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onCanvasMouseUp: () => void;
  onCanvasMouseLeave: () => void;
}

export const CalibrationCameraPanel = ({
  error,
  modelError,
  isReady,
  phase,
  draggedPointIndex,
  videoRef,
  canvasRef,
  cameraSource,
  remoteStatus,
  offer,
  onCameraSourceChange,
  onSubmitAnswer,
  onRestartRemote,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasMouseLeave,
}: CalibrationCameraPanelProps) => (
  <div className="calibration-camera-panel">
    <div className="camera-preview-container calibration-camera-preview">
      {(error || modelError) && <div className="error-message">{error || modelError}</div>}
      {!isReady && !error && !modelError && (
        <div className="loading-message">Initializing Hand Tracker AI...</div>
      )}
      <video ref={videoRef} autoPlay playsInline muted className="calibration-hidden-video" />
      <canvas
        ref={canvasRef}
        className={`camera-canvas calibration-canvas${
          phase === 'complete' ? (draggedPointIndex !== null ? ' is-dragging' : ' is-draggable') : ''
        }`}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseLeave}
      />
    </div>

    {phase === 'select' && (
      <div className="calibration-source-wrap">
        <CameraSourceSelector
          source={cameraSource}
          onSourceChange={onCameraSourceChange}
          remoteStatus={remoteStatus}
          offer={offer}
          onSubmitAnswer={onSubmitAnswer}
          onRestart={onRestartRemote}
        />
      </div>
    )}
  </div>
);
