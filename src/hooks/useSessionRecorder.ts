import { useCallback, useEffect, useRef } from 'react';
import type { CalibrationCameraSize } from '../types/calibration';
import { selectSupportedRecordingMimeType } from '../utils/mediaRecording';

const RECORDING_MAX_WIDTH = 960;
const RECORDING_FPS = 30;
const RECORDING_VIDEO_BITS_PER_SECOND = 1_500_000;

const getEvenSize = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const getRecordingSize = (sourceWidth: number, sourceHeight: number): CalibrationCameraSize => {
  if (sourceWidth <= RECORDING_MAX_WIDTH) {
    return { width: getEvenSize(sourceWidth), height: getEvenSize(sourceHeight) };
  }

  const scale = RECORDING_MAX_WIDTH / sourceWidth;
  return {
    width: getEvenSize(RECORDING_MAX_WIDTH),
    height: getEvenSize(sourceHeight * scale)
  };
};

interface UseSessionRecorderOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  calibrationCameraSize?: CalibrationCameraSize;
}

export function useSessionRecorder({
  videoRef,
  calibrationCameraSize,
}: UseSessionRecorderOptions) {
  const recordingCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingAnimationFrameRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingCameraSizeRef = useRef<CalibrationCameraSize | undefined>(calibrationCameraSize);

  const stopRecordingCapture = useCallback(() => {
    if (recordingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(recordingAnimationFrameRef.current);
      recordingAnimationFrameRef.current = null;
    }

    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }, []);

  useEffect(() => stopRecordingCapture, [stopRecordingCapture]);

  const startOfflineRecording = useCallback(() => {
    const video = videoRef.current;
    const canvas = recordingCanvasRef.current;
    if (!video || !canvas) {
      throw new Error('Recording video or canvas is not ready.');
    }

    recordedChunksRef.current = [];

    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    recordingCameraSizeRef.current = calibrationCameraSize ?? { width: sourceWidth, height: sourceHeight };

    const recordingSize = getRecordingSize(sourceWidth, sourceHeight);
    canvas.width = recordingSize.width;
    canvas.height = recordingSize.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create recording canvas context.');
    }

    const drawFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        ctx.drawImage(video, 0, 0, recordingSize.width, recordingSize.height);
      }
      recordingAnimationFrameRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const recordingStream = canvas.captureStream(RECORDING_FPS);
    recordingStreamRef.current = recordingStream;

    const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
      ? selectSupportedRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder))
      : undefined;
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND
    };
    if (mimeType) options.mimeType = mimeType;

    const recorder = new MediaRecorder(recordingStream, options);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.start(1000);
    mediaRecorderRef.current = recorder;

    console.log(
      `[Recording] Capturing ${sourceWidth}x${sourceHeight} as ` +
      `${recordingSize.width}x${recordingSize.height} at ${RECORDING_FPS}fps ` +
      `using ${recorder.mimeType || 'the browser default format'}.`
    );
  }, [calibrationCameraSize, videoRef]);

  const stopOfflineRecording = useCallback((): Promise<Blob | null> => (
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = () => {
          const recordedMimeType = recorder.mimeType
            || recordedChunksRef.current.find((chunk) => chunk.type)?.type
            || 'video/webm';
          const blob = new Blob(recordedChunksRef.current, { type: recordedMimeType });
          stopRecordingCapture();
          mediaRecorderRef.current = null;
          resolve(blob);
        };
        recorder.stop();
        return;
      }

      stopRecordingCapture();
      mediaRecorderRef.current = null;
      resolve(null);
    })
  ), [stopRecordingCapture]);

  return {
    recordingCanvasRef,
    recordingCameraSizeRef,
    startOfflineRecording,
    stopOfflineRecording,
    stopRecordingCapture,
  };
}
