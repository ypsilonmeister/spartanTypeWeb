import React, { useEffect, useRef, useState } from 'react';
import type { UnanalyzedSessionData, SessionData } from '../../types/session';
import { useWorker } from '../../hooks/useWorker';
import type { KeyboardLayout } from '../../types/kle';
import { runOfflineAnalysis } from '../../infra/offlineAnalyzer';

interface AnalysisPhaseProps {
  unanalyzedData: UnanalyzedSessionData;
  layout: KeyboardLayout;
  onAnalysisComplete: (data: SessionData) => void;
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

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    isAnalyzing.current = true;
    const run = runOfflineAnalysis({
      unanalyzedData,
      layout,
      worker,
      video,
      canvas,
      onProgress: ({ progress: nextProgress, status: nextStatus }) => {
        if (typeof nextProgress === 'number') setProgress(nextProgress);
        if (nextStatus) setStatus(nextStatus);
      },
      onComplete: onAnalysisComplete,
    });

    return () => {
      // StrictMode の二重エフェクトや依存変化での再実行時に、キャンセル済みの
      // 解析がガードに残って再開不能になるのを防ぐ (再実行側が最初からやり直す)。
      isAnalyzing.current = false;
      run.cancel();
    };
  }, [isWorkerReady, worker, unanalyzedData, layout, onAnalysisComplete]);

  return (
    <div className="analysis-phase">
      <h2 className="analysis-title">Post-Session Analysis</h2>
      {workerError && <div className="analysis-error">Worker Error: {workerError}</div>}
      <p className="analysis-status">{status}</p>

      <div className="analysis-progress">
        <div className="analysis-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <video
        ref={videoRef}
        className="analysis-hidden-video"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="analysis-hidden-canvas" />
    </div>
  );
};
