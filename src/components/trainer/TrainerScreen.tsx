import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import type { KeyboardLayout } from '../../types/kle';
import type { HomographyMatrix } from '../../utils/homography';
import { useWebcam } from '../../hooks/useWebcam';
import { TypingEngine } from '../../utils/TypingEngine';
import type { UnanalyzedSessionData } from '../../utils/TypingEngine';
import { getFlatPracticeList } from '../../utils/plantDictionary';
import '../../styles/cameraPreview.css';

interface TrainerScreenProps {
  layout: KeyboardLayout;
  homography: HomographyMatrix | null;
  onSessionComplete?: (data: UnanalyzedSessionData) => void;
}

export const TrainerScreen: React.FC<TrainerScreenProps> = ({ layout, homography, onSessionComplete }) => {
  const engineRef = useRef<TypingEngine | null>(null);
  const handleKeyPressRef = useRef<(code: string) => void>(() => {});

  const videoRef = useRef<HTMLVideoElement>(null);
  const { error: webcamError, stream } = useWebcam(videoRef);
  
  const [pressedKeyCode, setPressedKeyCode] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // MediaRecorder refs for post-session analysis
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sessionStartRef = useRef(0);

  // Typing practice states based on Plant Dictionary
  const practiceList = useMemo(() => getFlatPracticeList(), []);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [flashError, setFlashError] = useState(false);

  const handleKeyPress = useCallback((code: string) => {
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
    }
  }, [practiceList, currentWordIndex, currentCharIndex]);

  useEffect(() => {
    handleKeyPressRef.current = handleKeyPress;
  }, [handleKeyPress]);
  
  useEffect(() => {
    if (homography) {
      engineRef.current = new TypingEngine(layout, homography, (code) => handleKeyPressRef.current(code));
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, [homography, layout]);

  // 60fps main thread Hand Tracker Loop is removed to guarantee zero-latency.
  // Video capturing is handled directly via MediaRecorder.

  const toggleRecording = () => {
    if (!engineRef.current) return;
    
    if (isRecording) {
      engineRef.current.stopSession();
      setIsRecording(false);
      
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
      if (stream) {
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
    <div style={{ display: 'flex', gap: '2rem', width: '100%', maxWidth: '1200px', justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      
      {/* Left Column: Camera Video & Virtual Keyboard */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', flex: '1 1 640px', maxWidth: '720px' }}>
        <div className="camera-preview-container" style={{ width: '100%', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' }}>
          {webcamError && <div className="error-message">{webcamError}</div>}
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: 'auto', transform: 'scaleX(-1)' }} />
        </div>
        
        {/* Typing Word Display (Drill-down Drill) */}
        {isRecording && (
          <div style={{
            width: '100%',
            background: flashError ? 'rgba(255, 77, 77, 0.15)' : 'rgba(255, 255, 255, 0.03)',
            border: flashError ? '1px solid rgba(255, 77, 77, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '1.2rem',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.15s ease-in-out',
            boxSizing: 'border-box'
          }}>
            {/* Classification Path */}
            <div style={{ fontSize: '0.85rem', color: '#00adb5', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.4rem' }}>
              {practiceList[currentWordIndex]?.path}
            </div>
            
            {/* Japanese Label */}
            <div style={{ fontSize: '1.4rem', fontWeight: 400, color: '#fff', marginBottom: '0.8rem' }}>
              {practiceList[currentWordIndex]?.node.japanese}
            </div>
            
            {/* Romanized Text to Type */}
            <div style={{
              fontSize: '2rem',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              letterSpacing: '4px',
              color: 'rgba(255, 255, 255, 0.2)'
            }}>
              <span style={{ color: '#888' }}>
                {practiceList[currentWordIndex]?.node.romaji.slice(0, currentCharIndex)}
              </span>
              <span style={{ color: '#00ffcc', borderBottom: '3px solid #00ffcc', paddingBottom: '2px' }}>
                {practiceList[currentWordIndex]?.node.romaji[currentCharIndex]}
              </span>
              <span style={{ color: '#fff' }}>
                {practiceList[currentWordIndex]?.node.romaji.slice(currentCharIndex + 1)}
              </span>
            </div>
          </div>
        )}

        <div style={{ position: 'relative', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '16px' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '340px' }}>
        
        {/* Control Panel */}
        <div style={{
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}>
          {homography && (
            <div style={{ width: '100%', textAlign: 'center', padding: '0.5rem', background: 'rgba(0, 255, 0, 0.1)', color: '#0f0', borderRadius: '8px', border: '1px solid rgba(0, 255, 0, 0.2)', fontSize: '0.9rem' }}>
              ✓ キャリブレーション有効
            </div>
          )}
          <button 
            onClick={toggleRecording}
            style={{
              width: '100%',
              padding: '1rem',
              background: isRecording ? 'linear-gradient(135deg, #ff4d4d, #cc0000)' : 'linear-gradient(135deg, #00adb5, #007a82)',
              color: '#fff',
              border: 'none',
              borderRadius: '50px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1.1rem',
              boxShadow: isRecording ? '0 4px 15px rgba(255, 77, 77, 0.4)' : '0 4px 15px rgba(0, 173, 181, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            {isRecording ? '⏹ 練習終了して解析へ' : '⏺ タイピング練習開始'}
          </button>
          
          {isRecording && (
            <div style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', lineHeight: '1.4' }}>
              好きな文字を入力してください。<br />
              正しい指使いで入力すると、下の木が成長します。
            </div>
          )}
        </div>

        <div style={{
          flex: 1,
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: '0.95rem',
          lineHeight: '1.6',
          textAlign: 'center'
        }}>
          <div>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🌲</span>
            解析（Analysis）後に<br/>結果ツリーが表示されます
          </div>
        </div>
      </div>
    </div>
  );
};
