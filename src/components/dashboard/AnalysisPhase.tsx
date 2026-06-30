import React, { useEffect, useRef, useState } from 'react';
import type { UnanalyzedSessionData, SessionData } from '../../utils/TypingEngine';
import { TypingEngine } from '../../utils/TypingEngine';
import { useWorker } from '../../hooks/useWorker';
import { mapMediaPipeResults } from '../../utils/mediapipeUtils';
import type { MediaPipeHandResult } from '../../utils/mediapipeUtils';
import type { KeyboardLayout } from '../../types/kle';

interface AnalysisPhaseProps {
  unanalyzedData: UnanalyzedSessionData;
  layout: KeyboardLayout;
  onAnalysisComplete: (data: SessionData) => void;
}

type DetectResponse =
  | { type: 'DETECT_RESULT'; results?: MediaPipeHandResult; timestamp: number; requestId: string }
  | { type: 'DETECT_ERROR'; error: string; timestamp: number; requestId: string };

const MIN_FRAME_GAP_MS = 40;
const DETECTION_TIMEOUT_MS = 15000;

function buildTargetFrameTimes(keystrokes: UnanalyzedSessionData['keystrokes'], durationMs: number): number[] {
  const sorted = keystrokes
    .map((ks) => Math.min(Math.max(ks.timestamp, 0), Math.max(durationMs - 1, 0)))
    .sort((a, b) => a - b);

  const targets: number[] = [];
  for (const timestamp of sorted) {
    const previous = targets[targets.length - 1];
    if (previous === undefined || timestamp - previous >= MIN_FRAME_GAP_MS) {
      targets.push(timestamp);
    }
  }
  return targets;
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Video ${eventName} failed.`));
    };
    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  const maxTime = Number.isFinite(video.duration) ? Math.max(video.duration - 0.001, 0) : seconds;
  const target = Math.min(Math.max(seconds, 0), maxTime);

  video.pause();
  if (Math.abs(video.currentTime - target) < 0.004 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return;
  }

  const seeked = waitForVideoEvent(video, 'seeked');
  video.currentTime = target;
  await seeked;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function detectFrame(
  worker: Worker,
  bitmap: ImageBitmap,
  timestamp: number,
  requestId: string
): Promise<DetectResponse> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Hand detection timed out for frame ${requestId}.`));
    }, DETECTION_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
    };

    const handleMessage = (e: MessageEvent) => {
      const data = e.data as Partial<DetectResponse>;
      if (data.requestId !== requestId) return;
      cleanup();
      if (data.type === 'DETECT_ERROR') {
        reject(new Error(data.error));
      } else {
        resolve(data as DetectResponse);
      }
    };

    worker.addEventListener('message', handleMessage);
    try {
      worker.postMessage({ type: 'DETECT', image: bitmap, timestamp, requestId }, [bitmap]);
    } catch (err) {
      cleanup();
      bitmap.close();
      reject(err);
    }
  });
}

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
      // If no video was recorded (e.g. camera disabled), finalize immediately without frames
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
    const url = URL.createObjectURL(unanalyzedData.blob);

    const runTargetedAnalysis = async () => {
      const dummyEngine = new TypingEngine(layout, unanalyzedData.homography);
      let engineDestroyed = false;
      const destroyEngine = () => {
        if (!engineDestroyed) {
          dummyEngine.destroy();
          engineDestroyed = true;
        }
      };

      try {
        const metadataLoaded = waitForVideoEvent(video, 'loadedmetadata');
        video.src = url;
        video.load();
        await metadataLoaded;
        if (cancelled) {
          destroyEngine();
          return;
        }

        console.log(`[Analysis] Video metadata loaded. Resolution: ${video.videoWidth}x${video.videoHeight}, Duration: ${video.duration.toFixed(2)}s`);
        video.width = video.videoWidth;
        video.height = video.videoHeight;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not create analysis canvas context.');
        }

        const durationMs = Number.isFinite(video.duration)
          ? video.duration * 1000
          : Math.max(0, ...unanalyzedData.keystrokes.map((ks) => ks.timestamp));
        const targetTimes = buildTargetFrameTimes(unanalyzedData.keystrokes, durationMs);

        dummyEngine.startSession();
        if (targetTimes.length === 0) {
          setProgress(100);
        } else {
          setStatus(`Analyzing ${targetTimes.length} key frames...`);
        }

        for (let i = 0; i < targetTimes.length; i++) {
          if (cancelled) {
            destroyEngine();
            return;
          }
          const timestamp = targetTimes[i];
          await seekVideo(video, timestamp / 1000);
          if (cancelled) {
            destroyEngine();
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const bitmap = await createImageBitmap(canvas);
          let handsData: ReturnType<typeof mapMediaPipeResults> = [];
          try {
            const response = await detectFrame(worker, bitmap, timestamp, `post-session-${Date.now()}-${i}`);
            handsData = response.type === 'DETECT_RESULT'
              ? mapMediaPipeResults(response.results)
              : [];
          } catch (err) {
            console.error('[Analysis] Worker detection frame error:', err);
          }

          dummyEngine.processFrame(
            handsData,
            timestamp,
            canvas.width,
            canvas.height,
            unanalyzedData.isMirrored ?? true
          );

          if ((i + 1) % 30 === 0) {
            console.log(`[Analysis] Processed ${i + 1} / ${targetTimes.length} targeted frames.`);
          }
          setProgress(((i + 1) / targetTimes.length) * 100);
        }

        if (cancelled) {
          destroyEngine();
          return;
        }
        setStatus('Finalizing session data...');
        console.log(`[Analysis] Targeted frame processing complete. Total analyzed frames: ${targetTimes.length}. Exporting session JSON...`);
        dummyEngine.loadKeystrokes(unanalyzedData.keystrokes);
        const finalJson = dummyEngine.exportSession();
        destroyEngine();
        URL.revokeObjectURL(url);
        onAnalysisComplete(JSON.parse(finalJson));
      } catch (err) {
        destroyEngine();
        URL.revokeObjectURL(url);
        if (!cancelled) {
          console.error('[Analysis] Targeted analysis failed:', err);
          setStatus(err instanceof Error ? err.message : 'Failed to analyze recorded video.');
        }
      }
    };

    runTargetedAnalysis();

    video.onerror = (e) => {
      console.error("[Analysis] Video playback error:", e);
      setStatus('Failed to load recorded video.');
    };

    return () => {
      cancelled = true;
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
