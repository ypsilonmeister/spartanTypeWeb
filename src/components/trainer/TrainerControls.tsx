import { CameraSourceSelector } from '../camera/CameraSourceSelector';
import { useLanguage } from '../../hooks/useLanguage';
import type { CameraSource, RemoteStatus } from '../../hooks/useCameraSource';
import type { PracticeCategory } from '../../types/practice';

interface TrainerControlsProps {
  hasCalibration: boolean;
  isRecording: boolean;
  cameraSource: CameraSource;
  remoteStatus: RemoteStatus;
  offer: string | null;
  onCameraSourceChange: (source: CameraSource) => void;
  onSubmitAnswer: (answer: string) => void;
  onRestartRemote: () => void;
  practiceCategory: PracticeCategory;
  practiceCategoryLabels: Record<PracticeCategory, string>;
  onPracticeCategoryChange: (category: PracticeCategory) => void;
  analysisMode: 'offline' | 'realtime';
  onAnalysisModeChange: (mode: 'offline' | 'realtime') => void;
  isWorkerReady: boolean;
  onToggleRecording: () => void;
}

export const TrainerControls = ({
  hasCalibration,
  isRecording,
  cameraSource,
  remoteStatus,
  offer,
  onCameraSourceChange,
  onSubmitAnswer,
  onRestartRemote,
  practiceCategory,
  practiceCategoryLabels,
  onPracticeCategoryChange,
  analysisMode,
  onAnalysisModeChange,
  isWorkerReady,
  onToggleRecording,
}: TrainerControlsProps) => {
  const { t } = useLanguage();

  return (
  <div className="trainer-control-panel">
    {hasCalibration && (
      <div className="trainer-calibration-status">
        {t('trainer.calibrationActive')}
      </div>
    )}

    {!isRecording && (
      <CameraSourceSelector
        source={cameraSource}
        onSourceChange={onCameraSourceChange}
        remoteStatus={remoteStatus}
        offer={offer}
        onSubmitAnswer={onSubmitAnswer}
        onRestart={onRestartRemote}
      />
    )}

    <div className="trainer-mode-selector">
      <label className="trainer-mode-label">
        {t('trainer.practiceCategory')}
      </label>
      <div className="trainer-category-toggle">
        {(Object.keys(practiceCategoryLabels) as PracticeCategory[]).map(cat => (
          <button
            key={cat}
            disabled={isRecording}
            onClick={() => onPracticeCategoryChange(cat)}
            className={`trainer-category-btn${practiceCategory === cat ? ' is-active' : ''}`}
          >
            {practiceCategoryLabels[cat]}
          </button>
        ))}
      </div>
    </div>

    <div className="trainer-mode-selector">
      <label className="trainer-mode-label">
        {t('trainer.analysisMode')}
      </label>
      <div className="trainer-mode-toggle">
        <button
          disabled={isRecording}
          onClick={() => onAnalysisModeChange('offline')}
          className={`trainer-mode-btn${analysisMode === 'offline' ? ' is-active' : ''}`}
        >
          {t('trainer.modeOffline')}
        </button>
        <button
          disabled={isRecording}
          onClick={() => onAnalysisModeChange('realtime')}
          className={`trainer-mode-btn${analysisMode === 'realtime' ? ' is-active' : ''}`}
        >
          {t('trainer.modeRealtime')}
        </button>
      </div>
      {!isWorkerReady && analysisMode === 'realtime' && (
        <div className="trainer-model-loading">
          {t('trainer.modelLoading')}
        </div>
      )}
    </div>

    <button
      onClick={onToggleRecording}
      disabled={analysisMode === 'realtime' && !isWorkerReady}
      className={`trainer-record-btn${isRecording ? ' is-recording' : ''}`}
    >
      {isRecording ? t('trainer.stopBtn') : t('trainer.startBtn')}
    </button>

    {isRecording && (
      <div className="trainer-recording-hint">
        {t('trainer.recordingHintLine1')}<br />
        {t('trainer.recordingHintLine2')}
      </div>
    )}
  </div>
  );
};
