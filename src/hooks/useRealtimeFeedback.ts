import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { getKeystrokeVerdict } from '../domain/keystrokeStats';
import type { TypingSession } from '../domain/typingSession';
import type { DetectRequest, WorkerResponse } from '../infra/workerProtocol';
import { mapMediaPipeResults } from '../utils/mediapipeUtils';
import { translateFingerName } from '../utils/fingerLabels';
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
    if (analysisMode !== 'realtime' || keystrokeIndex < 0) return;

    const session = engineRef.current;
    const keystroke = session?.getKeystrokeByIndex(keystrokeIndex);
    if (!session || !keystroke) return;

    const video = videoRef.current;
    if (!isWorkerReady || !worker || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setRealtimeFeedback({ key: keystroke.key, verdict: 'unknown' });
      return;
    }

    createImageBitmap(video).then(bitmap => {
      if (engineRef.current !== session || session.getKeystrokeByIndex(keystrokeIndex) !== keystroke || !session.isSessionActive) {
        bitmap.close();
        return;
      }

      const timestamp = performance.now() - sessionStartRef.current;
      const request: DetectRequest = { type: 'DETECT', image: bitmap, timestamp, keystrokeIndex };
      try {
        worker.postMessage(request, [bitmap]);
      } catch (err) {
        bitmap.close();
        throw err;
      }
    }).catch(err => {
      console.error('Realtime frame capture failed:', err);
      if (engineRef.current === session && session.isSessionActive
        && session.getKeystrokeByIndex(keystrokeIndex) === keystroke
        && !session.getKeystrokeByIndex(keystrokeIndex + 1)) {
        setRealtimeFeedback({ key: keystroke.key, verdict: 'unknown' });
      }
    });
  }, [analysisMode, engineRef, isWorkerReady, sessionStartRef, videoRef, worker]);

  useEffect(() => {
    if (analysisMode !== 'realtime' || !worker || !isWorkerReady) return;

    const handleWorkerMessage = (e: MessageEvent<WorkerResponse>) => {
      const message = e.data;
      if (message.type !== 'DETECT_RESULT' && message.type !== 'DETECT_ERROR') return;

      const session = engineRef.current;
      if (!session?.isSessionActive) return;

      const { keystrokeIndex } = message;
      const match = typeof keystrokeIndex === 'number'
        ? session.getKeystrokeByIndex(keystrokeIndex)
        : null;
      if (!match) return;

      if (message.type === 'DETECT_ERROR') {
        setRealtimeFeedback({ key: match.key, verdict: 'unknown' });
        return;
      }

      const handsData = mapMediaPipeResults(message.results);
      const video = videoRef.current;
      const videoWidth = video?.videoWidth || 640;
      const videoHeight = video?.videoHeight || 480;
      session.processFrame(handsData, message.timestamp, videoWidth, videoHeight, isMirrored);

      const addedFrame = session.getFrames().at(-1);
      const analysis = addedFrame ? session.analyzeKeystrokeRealtime(match, addedFrame) : null;
      const verdict = getKeystrokeVerdict(analysis?.isCorrectFinger);
      if (!analysis || verdict === 'unknown') {
        setRealtimeFeedback({ key: match.key, verdict: 'unknown' });
        return;
      }

      setRealtimeFeedback({
        key: match.key,
        verdict,
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
