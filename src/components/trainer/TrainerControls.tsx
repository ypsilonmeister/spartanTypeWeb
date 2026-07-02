import { CameraSourceSelector } from '../camera/CameraSourceSelector';
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
}: TrainerControlsProps) => (
  <div className="trainer-control-panel">
    {hasCalibration && (
      <div className="trainer-calibration-status">
        ✓ キャリブレーション有効
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
        練習カテゴリ
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
        解析モード
      </label>
      <div className="trainer-mode-toggle">
        <button
          disabled={isRecording}
          onClick={() => onAnalysisModeChange('offline')}
          className={`trainer-mode-btn${analysisMode === 'offline' ? ' is-active' : ''}`}
        >
          🎥 録画後解析
        </button>
        <button
          disabled={isRecording}
          onClick={() => onAnalysisModeChange('realtime')}
          className={`trainer-mode-btn${analysisMode === 'realtime' ? ' is-active' : ''}`}
        >
          ⚡️ 打鍵時即時
        </button>
      </div>
      {!isWorkerReady && analysisMode === 'realtime' && (
        <div className="trainer-model-loading">
          ⚠️ AIモデル起動中...
        </div>
      )}
    </div>

    <button
      onClick={onToggleRecording}
      disabled={analysisMode === 'realtime' && !isWorkerReady}
      className={`trainer-record-btn${isRecording ? ' is-recording' : ''}`}
    >
      {isRecording ? '⏹ 練習終了して解析へ' : '⏺ タイピング練習開始'}
    </button>

    {isRecording && (
      <div className="trainer-recording-hint">
        好きな文字を入力してください。<br />
        正しい指使いで入力すると、下の木が成長します。
      </div>
    )}
  </div>
);
