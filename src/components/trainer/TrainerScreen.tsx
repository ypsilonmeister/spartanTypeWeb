import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import type { KeyboardLayout } from '../../types/kle';
import { useCameraSource } from '../../hooks/useCameraSource';
import type { CameraSource } from '../../hooks/useCameraSource';
import { TypingSession } from '../../domain/typingSession';
import { subscribeKeyboardCapture } from '../../infra/keyboardCapture';
import type { UnanalyzedSessionData, SessionData } from '../../types/session';
import { useWorker } from '../../hooks/useWorker';
import { usePracticeDrill } from '../../hooks/usePracticeDrill';
import { useSessionRecorder } from '../../hooks/useSessionRecorder';
import { useRealtimeFeedback } from '../../hooks/useRealtimeFeedback';
import { PracticeWordDisplay } from './PracticeWordDisplay';
import { TrainerControls } from './TrainerControls';
import { PlantTreeCanvas } from '../tree/PlantTreeCanvas';
import '../../styles/cameraPreview.css';
import '../../styles/trainer.css';
import type { CalibrationCameraSize, CalibrationHomography } from '../../types/calibration';

interface TrainerScreenProps {
  layout: KeyboardLayout;
  homography: CalibrationHomography | null;
  calibrationCameraSize?: CalibrationCameraSize;
  onSessionComplete?: (data: UnanalyzedSessionData | SessionData) => void;
}

export const TrainerScreen: React.FC<TrainerScreenProps> = ({
  layout,
  homography,
  calibrationCameraSize,
  onSessionComplete
}) => {
  const engineRef = useRef<TypingSession | null>(null);
  const handleKeyPressRef = useRef<(code: string, keystrokeIndex: number) => void>(() => {});

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraSource, setCameraSource] = useState<CameraSource>('local');
  const {
    error: webcamError,
    stream,
    isMirrored,
    remoteStatus,
    offer,
    submitAnswer,
    restartRemote,
  } = useCameraSource(videoRef, cameraSource);

  const [pressedKeyCode, setPressedKeyCode] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1200 : window.innerWidth
  ));
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window === 'undefined' ? 800 : window.innerHeight
  ));

  // MediaRecorder refs for post-session analysis
  const sessionStartRef = useRef(0);
  const {
    recordingCanvasRef,
    recordingCameraSizeRef,
    startOfflineRecording,
    stopOfflineRecording,
    stopRecordingCapture,
  } = useSessionRecorder({ videoRef, calibrationCameraSize });

  // Analysis mode: offline (record and analyze) vs realtime (capture at keypress)
  const [analysisMode, setAnalysisMode] = useState<'offline' | 'realtime'>(() => {
    const saved = localStorage.getItem('spartan_analysis_mode');
    return (saved === 'realtime') ? 'realtime' : 'offline';
  });

  const handleSetAnalysisMode = (mode: 'offline' | 'realtime') => {
    setAnalysisMode(mode);
    localStorage.setItem('spartan_analysis_mode', mode);
  };

  const { worker, isWorkerReady } = useWorker();
  const {
    realtimeFeedback,
    setRealtimeFeedback,
    captureRealtimeFrame,
  } = useRealtimeFeedback({
    analysisMode,
    worker,
    isWorkerReady,
    videoRef,
    sessionStartRef,
    engineRef,
    isMirrored,
  });

  const {
    practiceCategory,
    practiceCategoryLabels,
    practiceList,
    currentWordIndex,
    currentCharIndex,
    correctCount,
    incorrectCount,
    lastPressedKey,
    flashError,
    handleSetPracticeCategory,
    handleKeyCode,
    resetProgress,
  } = usePracticeDrill();

  const keyboardUnitSize = useMemo(() => {
    const appPadding = viewportWidth <= 700 ? 32 : viewportWidth <= 1100 ? 48 : 64;
    const sidePanelWidth = isRecording && viewportWidth > 1100 ? 332 : 0;
    const keyboardChrome = 48;
    const availableWidth = Math.max(
      320,
      viewportWidth - appPadding - sidePanelWidth - keyboardChrome
    );
    const fitUnitSize = Math.floor(availableWidth / layout.width);
    const targetUnitSize = isRecording ? 56 : 42;
    const minimumUnitSize = isRecording ? 44 : 32;

    // Cap by viewport height too: on short/tablet screens the camera preview,
    // word display and controls already take up most of the height, so the
    // keyboard shouldn't grow to the width-only target and force scrolling.
    const heightBudget = viewportHeight * (isRecording ? 0.42 : 0.3);
    const heightUnitSize = Math.floor(heightBudget / layout.height);

    return Math.max(minimumUnitSize, Math.min(targetUnitSize, fitUnitSize, heightUnitSize));
  }, [isRecording, layout.width, layout.height, viewportWidth, viewportHeight]);

  const handleKeyPress = useCallback((code: string, keystrokeIndex: number) => {
    setPressedKeyCode(code);
    setTimeout(() => {
      setPressedKeyCode(null);
    }, 150);

    if (engineRef.current && engineRef.current.isSessionActive) {
      handleKeyCode(code);
      captureRealtimeFrame(keystrokeIndex);
    }
  }, [captureRealtimeFrame, handleKeyCode]);

  useEffect(() => {
    handleKeyPressRef.current = handleKeyPress;
  }, [handleKeyPress]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  useEffect(() => {
    if (homography) {
      engineRef.current = new TypingSession(
        layout,
        homography,
        calibrationCameraSize
      );
    }
  }, [homography, layout, calibrationCameraSize]);

  useEffect(() => subscribeKeyboardCapture(({ key, code, timestamp }) => {
    const session = engineRef.current;
    let keystrokeIndex = -1;

    if (session?.isSessionActive) {
      keystrokeIndex = session.recordKeystroke(
        key,
        code,
        timestamp - sessionStartRef.current
      );
    }

    handleKeyPressRef.current(code, keystrokeIndex);
  }), []);

  // 60fps main thread Hand Tracker Loop is removed to guarantee zero-latency.
  // Video capture is downscaled through a canvas before MediaRecorder to keep long sessions lighter.

  const toggleRecording = async () => {
    if (!engineRef.current) return;
    
    if (isRecording) {
      const recordingDurationMs = performance.now() - sessionStartRef.current;
      engineRef.current.stopSession();
      setIsRecording(false);
      
      if (analysisMode === 'realtime') {
        if (onSessionComplete) {
          const finalJson = engineRef.current.exportSession();
          onSessionComplete(JSON.parse(finalJson));
        }
        return;
      }
      
      const finalizeSession = (blob: Blob | null) => {
        if (onSessionComplete) {
          onSessionComplete({
            blob,
            recordingDurationMs,
            keystrokes: engineRef.current!.getRawKeystrokes(),
            homography: homography!,
            calibrationCameraSize: recordingCameraSizeRef.current ?? calibrationCameraSize,
            isMirrored
          });
        }
      };

      const blob = await stopOfflineRecording();
      finalizeSession(blob);
      
    } else {
      setRealtimeFeedback(null);
      
      if (analysisMode === 'offline' && stream) {
        try {
          startOfflineRecording();
        } catch (e) {
          console.error("MediaRecorder start failed:", e);
          stopRecordingCapture();
        }
      }

      sessionStartRef.current = performance.now();
      engineRef.current.startSession();
      setIsRecording(true);
      resetProgress();
    }
  };

  return (
    <div className={`trainer-layout${isRecording ? ' is-recording' : ''}`}>

      {/* Left Column: Camera Video & Virtual Keyboard */}
      <div className="trainer-left-column">
        <div className="camera-preview-container trainer-camera-preview">
          {webcamError && <div className="error-message">{webcamError}</div>}
          {/* 内向きカメラは鏡像、スマホ背面カメラはミラー不要 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="trainer-camera-video"
            style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
          />
          <canvas ref={recordingCanvasRef} className="trainer-recording-canvas" />
        </div>

        {isRecording && (
          <PracticeWordDisplay
            entry={practiceList[currentWordIndex]}
            currentCharIndex={currentCharIndex}
            flashError={flashError}
            realtimeFeedback={realtimeFeedback}
          />
        )}

        <div className="trainer-keyboard-wrapper">
           <VirtualKeyboard
            layout={layout}
            unitSize={keyboardUnitSize}
            gap={5}
            pointers={[]}
            activeKeyCode={pressedKeyCode}
          />
        </div>
      </div>

      {/* Right Column: Controls & Plant Tree */}
      <div className="trainer-right-column">
        <TrainerControls
          hasCalibration={!!homography}
          isRecording={isRecording}
          cameraSource={cameraSource}
          remoteStatus={remoteStatus}
          offer={offer}
          onCameraSourceChange={setCameraSource}
          onSubmitAnswer={submitAnswer}
          onRestartRemote={restartRemote}
          practiceCategory={practiceCategory}
          practiceCategoryLabels={practiceCategoryLabels}
          onPracticeCategoryChange={handleSetPracticeCategory}
          analysisMode={analysisMode}
          onAnalysisModeChange={handleSetAnalysisMode}
          isWorkerReady={isWorkerReady}
          onToggleRecording={toggleRecording}
        />

        <PlantTreeCanvas
          correctCount={correctCount}
          incorrectCount={incorrectCount}
          lastPressedKey={lastPressedKey}
          width={276}
          height={300}
          caption="Live Typing Tree"
        />
      </div>
    </div>
  );
};
