import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import type { KeyboardLayout } from '../../types/kle';
import { useCameraSource } from '../../hooks/useCameraSource';
import type { CameraSource } from '../../hooks/useCameraSource';
import { CameraSourceSelector } from '../camera/CameraSourceSelector';
import { TypingEngine } from '../../utils/TypingEngine';
import type { UnanalyzedSessionData, SessionData, FrameLog } from '../../utils/TypingEngine';
import { useWorker } from '../../hooks/useWorker';
import { getFlatPracticeList } from '../../utils/plantDictionary';
import { mapMediaPipeResults } from '../../utils/mediapipeUtils';
import '../../styles/cameraPreview.css';
import '../../styles/trainer.css';
import type { CalibrationHomography } from '../../utils/calibrationStorage';

interface TrainerScreenProps {
  layout: KeyboardLayout;
  homography: CalibrationHomography | null;
  onSessionComplete?: (data: UnanalyzedSessionData | SessionData) => void;
}

export const TrainerScreen: React.FC<TrainerScreenProps> = ({ layout, homography, onSessionComplete }) => {
  const engineRef = useRef<TypingEngine | null>(null);
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

  // MediaRecorder refs for post-session analysis
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sessionStartRef = useRef(0);

  // Analysis mode: offline (record and analyze) vs realtime (capture at keypress)
  const [analysisMode, setAnalysisMode] = useState<'offline' | 'realtime'>(() => {
    const saved = localStorage.getItem('spartan_analysis_mode');
    return (saved === 'realtime') ? 'realtime' : 'offline';
  });

  const handleSetAnalysisMode = (mode: 'offline' | 'realtime') => {
    setAnalysisMode(mode);
    localStorage.setItem('spartan_analysis_mode', mode);
  };

  // Real-time worker and feedback
  const { worker, isWorkerReady } = useWorker();
  interface RealtimeFeedback {
    key: string;
    isCorrect: boolean;
    expected: string;
    got: string;
  }
  const [realtimeFeedback, setRealtimeFeedback] = useState<RealtimeFeedback | null>(null);

  // Typing practice states based on Plant Dictionary
  const practiceList = useMemo(() => getFlatPracticeList({ shuffle: true }), []);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [flashError, setFlashError] = useState(false);

  const handleKeyPress = useCallback((code: string, keystrokeIndex: number) => {
    setPressedKeyCode(code);
    setTimeout(() => {
      setPressedKeyCode(null);
    }, 150);

    if (engineRef.current && engineRef.current.isSessionActive) {
      const currentWord = practiceList[currentWordIndex];
      if (!currentWord) return;

      const expectedChar = currentWord.node.romaji[currentCharIndex];
      // Extract the character typed (only letters for this plant romanized typing)
      const pressedChar = code.startsWith('Key') ? code.substring(3).toUpperCase() : '';

      if (pressedChar) {
        if (pressedChar === expectedChar) {
          // Advance indices
          if (currentCharIndex + 1 >= currentWord.node.romaji.length) {
            // Word completed! Go to next hierarchy
            setCurrentCharIndex(0);
            setCurrentWordIndex(prev => (prev + 1) % practiceList.length);
          } else {
            setCurrentCharIndex(prev => prev + 1);
          }
        } else {
          // 2. Typing Mistake (Wrong key typed)
          setFlashError(true);
          setTimeout(() => setFlashError(false), 150);
        }
      }

      // Capture frame immediately for real-time mode.
      // keystrokeIndex を worker へ渡し、応答を発火元キーストロークへ確実に紐付ける。
      if (analysisMode === 'realtime' && keystrokeIndex >= 0 && isWorkerReady && worker && videoRef.current) {
        const video = videoRef.current;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          createImageBitmap(video).then(bitmap => {
            const timestamp = performance.now() - sessionStartRef.current;
            worker.postMessage({ type: 'DETECT', image: bitmap, timestamp, keystrokeIndex }, [bitmap]);
          }).catch(err => console.error("Realtime frame capture failed:", err));
        }
      }
    }
  }, [practiceList, currentWordIndex, currentCharIndex, analysisMode, isWorkerReady, worker]);

  useEffect(() => {
    handleKeyPressRef.current = handleKeyPress;
  }, [handleKeyPress]);
  
  useEffect(() => {
    if (homography) {
      engineRef.current = new TypingEngine(layout, homography, (code, idx) => handleKeyPressRef.current(code, idx));
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, [homography, layout]);

  // Handle worker responses in real-time mode
  useEffect(() => {
    if (analysisMode !== 'realtime' || !worker || !isWorkerReady) return;

    const handleWorkerMessage = (e: MessageEvent) => {
      if (e.data.type === 'DETECT_RESULT') {
        const { results, timestamp, keystrokeIndex } = e.data;
        if (!engineRef.current) return;

        // Map results to HandData format using shared utility
        const handsData = mapMediaPipeResults(results);

        // Map to layout coordinates and process frame
        const video = videoRef.current;
        const videoWidth = video?.videoWidth || 640;
        const videoHeight = video?.videoHeight || 480;
        engineRef.current.processFrame(handsData, timestamp, videoWidth, videoHeight);

        // keystrokeIndex で発火元キーストロークを確実に取得 (timestamp 近似に頼らない)
        const match = typeof keystrokeIndex === 'number'
          ? engineRef.current.getKeystrokeByIndex(keystrokeIndex)
          : null;

        if (match) {
          // Get the frame we just appended (processFrame pushes synchronously to the tail)
          const framesList = engineRef.current.getFrames();
          const addedFrame: FrameLog | null = framesList.length > 0
            ? framesList[framesList.length - 1]
            : null;

          if (addedFrame) {
            const analysis = engineRef.current.analyzeKeystrokeRealtime(match, addedFrame);

            const translateFinger = (f: string | string[]) => {
              const map: Record<string, string> = {
                LeftPinky: '左手小指', LeftRing: '左手薬指', LeftMiddle: '左手中指', LeftIndex: '左手人差し指', LeftThumb: '左手親指',
                RightThumb: '右手親指', RightIndex: '右手人差し指', RightMiddle: '右手中指', RightRing: '右手薬指', RightPinky: '右手小指',
                Unknown: '不明'
              };
              if (Array.isArray(f)) {
                return f.map(x => map[x] || x).join(' または ');
              }
              return map[f] || f;
            };

            setRealtimeFeedback({
              key: match.key,
              isCorrect: !!analysis.isCorrectFinger,
              expected: translateFinger(analysis.expectedFinger),
              got: translateFinger(analysis.predictedFinger)
            });
          }
        }
      }
    };

    worker.addEventListener('message', handleWorkerMessage);
    return () => {
      worker.removeEventListener('message', handleWorkerMessage);
    };
  }, [analysisMode, worker, isWorkerReady]);

  // 60fps main thread Hand Tracker Loop is removed to guarantee zero-latency.
  // Video capturing is handled directly via MediaRecorder.

  const toggleRecording = () => {
    if (!engineRef.current) return;
    
    if (isRecording) {
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
            keystrokes: engineRef.current!.getRawKeystrokes(),
            homography: homography!
          });
        }
      };

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          finalizeSession(blob);
        };
        mediaRecorderRef.current.stop();
      } else {
        finalizeSession(null);
      }
      
    } else {
      setRealtimeFeedback(null);
      
      if (analysisMode === 'offline' && stream) {
        recordedChunksRef.current = [];
        try {
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
        } catch (e) {
          console.error("MediaRecorder start failed:", e);
        }
      }

      sessionStartRef.current = performance.now();
      engineRef.current.startSession(sessionStartRef.current);
      setIsRecording(true);
      setCurrentWordIndex(0);
      setCurrentCharIndex(0);
    }
  };

  return (
    <div className="trainer-layout">

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
        </div>

        {/* Typing Word Display (Drill-down Drill) */}
        {isRecording && (
          <div className={`trainer-word-display${flashError ? ' is-error' : ''}`}>
            {/* Classification Path */}
            <div className="trainer-word-path">
              {practiceList[currentWordIndex]?.path}
            </div>

            {/* Japanese Label */}
            <div className="trainer-word-japanese">
              {practiceList[currentWordIndex]?.node.japanese}
            </div>

            {/* Romanized Text to Type */}
            <div className="trainer-word-romaji">
              <span className="trainer-romaji-typed">
                {practiceList[currentWordIndex]?.node.romaji.slice(0, currentCharIndex)}
              </span>
              <span className="trainer-romaji-current">
                {practiceList[currentWordIndex]?.node.romaji[currentCharIndex]}
              </span>
              <span className="trainer-romaji-remaining">
                {practiceList[currentWordIndex]?.node.romaji.slice(currentCharIndex + 1)}
              </span>
            </div>
            {realtimeFeedback && (
              <div
                className={`trainer-realtime-feedback${realtimeFeedback.isCorrect ? ' is-correct' : ' is-incorrect'}`}
              >
                {realtimeFeedback.isCorrect ? (
                  <span>✓ 正しい指使いです！ ({realtimeFeedback.got})</span>
                ) : (
                  <span>
                    ✗ 違います！ (想定: {realtimeFeedback.expected} → 検出: {realtimeFeedback.got})
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="trainer-keyboard-wrapper">
           <VirtualKeyboard
            layout={layout}
            unitSize={42}
            gap={5}
            pointers={[]}
            activeKeyCode={pressedKeyCode}
          />
        </div>
      </div>

      {/* Right Column: Controls & Plant Tree */}
      <div className="trainer-right-column">

        {/* Control Panel */}
        <div className="trainer-control-panel">
          {homography && (
            <div className="trainer-calibration-status">
              ✓ キャリブレーション有効
            </div>
          )}

          {/* Camera Source Selector (PC内蔵 / スマホ) */}
          {!isRecording && (
            <CameraSourceSelector
              source={cameraSource}
              onSourceChange={setCameraSource}
              remoteStatus={remoteStatus}
              offer={offer}
              onSubmitAnswer={submitAnswer}
              onRestart={restartRemote}
            />
          )}

          {/* Mode Selector */}
          <div className="trainer-mode-selector">
            <label className="trainer-mode-label">
              解析モード
            </label>
            <div className="trainer-mode-toggle">
              <button
                disabled={isRecording}
                onClick={() => handleSetAnalysisMode('offline')}
                className={`trainer-mode-btn${analysisMode === 'offline' ? ' is-active' : ''}`}
              >
                🎥 録画後解析
              </button>
              <button
                disabled={isRecording}
                onClick={() => handleSetAnalysisMode('realtime')}
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
            onClick={toggleRecording}
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

        <div className="trainer-tree-panel">
          <div>
            <span className="trainer-tree-icon">🌲</span>
            解析（Analysis）後に<br/>結果ツリーが表示されます
          </div>
        </div>
      </div>
    </div>
  );
};
