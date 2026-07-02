import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { TypingSession } from '../domain/typingSession';
import type { DetectRequest, WorkerResponse } from '../infra/workerProtocol';
import { mapMediaPipeResults } from '../utils/mediapipeUtils';
import { translateFingerName } from '../utils/fingerLabels';
import type { FrameLog } from '../types/session';
import type { RealtimeFeedbackData } from '../components/trainer/RealtimeFeedback';

interface UseRealtimeFeedbackOptions {
  analysisMode: 'offline' | 'realtime';
  worker: Worker | null;
  isWorkerReady: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  sessionStartRef: MutableRefObject<number>;
  engineRef: MutableRefObject<TypingSession | null>;
  isMirrored: boolean;
}

export function useRealtimeFeedback({
  analysisMode,
  worker,
  isWorkerReady,
  videoRef,
  sessionStartRef,
  engineRef,
  isMirrored,
}: UseRealtimeFeedbackOptions) {
  const [realtimeFeedback, setRealtimeFeedback] = useState<RealtimeFeedbackData | null>(null);

  const captureRealtimeFrame = useCallback((keystrokeIndex: number) => {
    if (analysisMode !== 'realtime' || keystrokeIndex < 0 || !isWorkerReady || !worker) return;

    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    createImageBitmap(video).then(bitmap => {
      const timestamp = performance.now() - sessionStartRef.current;
      const request: DetectRequest = { type: 'DETECT', image: bitmap, timestamp, keystrokeIndex };
      worker.postMessage(request, [bitmap]);
    }).catch(err => console.error('Realtime frame capture failed:', err));
  }, [analysisMode, isWorkerReady, sessionStartRef, videoRef, worker]);

  useEffect(() => {
    if (analysisMode !== 'realtime' || !worker || !isWorkerReady) return;

    const handleWorkerMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type !== 'DETECT_RESULT') return;

      const { results, timestamp, keystrokeIndex } = e.data;
      const session = engineRef.current;
      if (!session) return;

      const handsData = mapMediaPipeResults(results);
      const video = videoRef.current;
      const videoWidth = video?.videoWidth || 640;
      const videoHeight = video?.videoHeight || 480;
      session.processFrame(handsData, timestamp, videoWidth, videoHeight, isMirrored);

      const match = typeof keystrokeIndex === 'number'
        ? session.getKeystrokeByIndex(keystrokeIndex)
        : null;

      if (!match) return;

      const framesList = session.getFrames();
      const addedFrame: FrameLog | null = framesList.length > 0
        ? framesList[framesList.length - 1]
        : null;

      if (!addedFrame) return;

      const analysis = session.analyzeKeystrokeRealtime(match, addedFrame);
      if (!analysis) return;

      setRealtimeFeedback({
        key: match.key,
        isCorrect: !!analysis.isCorrectFinger,
        expected: translateFingerName(analysis.expectedFinger),
        got: translateFingerName(analysis.predictedFinger)
      });
    };

    worker.addEventListener('message', handleWorkerMessage);
    return () => {
      worker.removeEventListener('message', handleWorkerMessage);
    };
  }, [analysisMode, engineRef, isMirrored, isWorkerReady, videoRef, worker]);

  return {
    realtimeFeedback,
    setRealtimeFeedback,
    captureRealtimeFrame,
  };
}
