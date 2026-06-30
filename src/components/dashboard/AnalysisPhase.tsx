import React, { useEffect, useRef, useState } from 'react';
import type { UnanalyzedSessionData, SessionData } from '../../utils/TypingEngine';
import { TypingEngine } from '../../utils/TypingEngine';
import { useWorker } from '../../hooks/useWorker';
import { mapMediaPipeResults } from '../../utils/mediapipeUtils';
import type { KeyboardLayout } from '../../types/kle';

interface AnalysisPhaseProps {
  unanalyzedData: UnanalyzedSessionData;
  layout: KeyboardLayout;
  onAnalysisComplete: (data: SessionData) => void;
}

type VideoWithCallback = HTMLVideoElement & {
  requestVideoFrameCallback: (callback: (now: number, metadata: Record<string, unknown>) => void) => number;
};

export const AnalysisPhase: React.FC<AnalysisPhaseProps> = ({ unanalyzedData, layout, onAnalysisComplete }) => {
  const { worker, isWorkerReady, workerError } = useWorker();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('Preparing video for analysis...');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isAnalyzing = useRef(false);

  useEffect(() => {
    if (!isWorkerReady || !worker || isAnalyzing.current) return;
    if (!unanalyzedData.blob) {
      const dummyEngine = new TypingEngine(layout, unanalyzedData.homography);
      dummyEngine.loadKeystrokes(unanalyzedData.keystrokes);
      const jsonStr = dummyEngine.exportSession();
      dummyEngine.destroy();
      onAnalysisComplete(JSON.parse(jsonStr));
      return;
    }

    isAnalyzing.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    let cleanupAnalysis = () => {};
    const url = URL.createObjectURL(unanalyzedData.blob);
    video.src = url;

    video.onloadeddata = () => {
      console.log(`[Analysis] Video metadata loaded. Resolution: ${video.videoWidth}x${video.videoHeight}, Duration: ${video.duration.toFixed(2)}s`);
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setStatus('Could not create analysis canvas context.');
        URL.revokeObjectURL(url);
        return;
      }

      setStatus('Analyzing frames accurately...');

      const dummyEngine = new TypingEngine(layout, unanalyzedData.homography);
      dummyEngine.startSession();

      let pendingFrames = 0;
      let lastProcessedTime = -1;
      let frameCounter = 0;
      let isFinalized = false;
      let finalizeRetryCount = 0;
      const FINALIZE_MAX_RETRIES = 100;

      const destroyEngine = () => {
        dummyEngine.destroy();
      };

      const handleWorkerMessage = (e: MessageEvent) => {
        if (e.data.type === 'DETECT_RESULT') {
          pendingFrames--;
          const { results, timestamp } = e.data;

          frameCounter++;
          if (frameCounter % 30 === 0) {
            console.log(`[Analysis] Processed ${frameCounter} frames. Video Time: ${video.currentTime.toFixed(2)}s / ${video.duration.toFixed(2)}s. Queue: ${pendingFrames}`);
          }

          if (results && results.landmarks && results.landmarks.length > 0) {
            const handsData = mapMediaPipeResults(results);
            dummyEngine.processFrame(
              handsData,
              timestamp,
              canvas.width,
              canvas.height,
              unanalyzedData.isMirrored ?? true
            );
          } else {
            dummyEngine.processFrame(
              [],
              timestamp,
              canvas.width,
              canvas.height,
              unanalyzedData.isMirrored ?? true
            );
          }
        } else if (e.data.type === 'DETECT_ERROR') {
          pendingFrames--;
          console.error('[Analysis] Worker detection frame error:', e.data.error);
        }
      };

      worker.addEventListener('message', handleWorkerMessage);

      const finalize = () => {
        if (isFinalized) return;
        if (pendingFrames > 0 && finalizeRetryCount < FINALIZE_MAX_RETRIES) {
          finalizeRetryCount++;
          console.log(`[Analysis] Finalizing queued. Waiting for ${pendingFrames} pending frames to resolve... (retry ${finalizeRetryCount}/${FINALIZE_MAX_RETRIES})`);
          setTimeout(finalize, 100);
          return;
        }
        if (pendingFrames > 0) {
          console.warn(`[Analysis] Timed out waiting for ${pendingFrames} pending frames. Proceeding with available data.`);
        }
        isFinalized = true;

        worker.removeEventListener('message', handleWorkerMessage);
        video.removeEventListener('ended', handleVideoEnded);
        URL.revokeObjectURL(url);

        setStatus('Finalizing session data...');
        console.log(`[Analysis] Frame processing complete. Total analyzed frames: ${frameCounter}. Exporting session JSON...`);
        dummyEngine.loadKeystrokes(unanalyzedData.keystrokes);
        const finalJson = dummyEngine.exportSession();
        destroyEngine();
        if (!cancelled) {
          onAnalysisComplete(JSON.parse(finalJson));
        }
      };

      const handleVideoEnded = () => {
        console.log('[Analysis] Video ended event fired. Finalizing...');
        finalize();
      };

      video.addEventListener('ended', handleVideoEnded);
      cleanupAnalysis = () => {
        worker.removeEventListener('message', handleWorkerMessage);
        video.removeEventListener('ended', handleVideoEnded);
        destroyEngine();
      };

      video.playbackRate = 1.0;
      video.play().catch((err) => {
        console.error('[Analysis] Video playback error:', err);
        setStatus('Failed to play recorded video.');
        cleanupAnalysis();
      });
      console.log('[Analysis] Video playback started.');

      const processVideoFrame = () => {
        if (cancelled || isFinalized) return;
        if (video.paused || video.ended) {
          finalize();
          return;
        }

        if (video.currentTime !== lastProcessedTime && pendingFrames < 2) {
          lastProcessedTime = video.currentTime;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          createImageBitmap(canvas).then(bitmap => {
            if (cancelled || isFinalized) {
              bitmap.close();
              return;
            }
            pendingFrames++;
            const timestamp = video.currentTime * 1000;
            worker.postMessage({ type: 'DETECT', image: bitmap, timestamp }, [bitmap]);
          }).catch(err => console.error('[Analysis] Bitmap creation failed:', err));
        }

        setProgress(Number.isFinite(video.duration) ? (video.currentTime / video.duration) * 100 : 0);

        if ('requestVideoFrameCallback' in video) {
          (video as VideoWithCallback).requestVideoFrameCallback(processVideoFrame);
        } else {
          requestAnimationFrame(processVideoFrame);
        }
      };

      if ('requestVideoFrameCallback' in video) {
        (video as VideoWithCallback).requestVideoFrameCallback(processVideoFrame);
      } else {
        requestAnimationFrame(processVideoFrame);
      }
    };

    video.onerror = (e) => {
      console.error('[Analysis] Video playback error:', e);
      setStatus('Failed to load recorded video.');
    };

    return () => {
      cancelled = true;
      cleanupAnalysis();
      URL.revokeObjectURL(url);
    };
  }, [isWorkerReady, worker, unanalyzedData, layout, onAnalysisComplete]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', width: '100%' }}>
      <h2 style={{ marginBottom: '1rem' }}>Post-Session Analysis</h2>
      {workerError && <div style={{ color: 'red' }}>Worker Error: {workerError}</div>}
      <p style={{ color: '#00adb5', fontSize: '1.2rem', marginBottom: '2rem' }}>{status}</p>

      <div style={{ width: '80%', maxWidth: '600px', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#00adb5', transition: 'width 0.2s' }} />
      </div>

      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: 0.01,
          pointerEvents: 'none',
          zIndex: -1
        }}
        muted
        playsInline
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};
