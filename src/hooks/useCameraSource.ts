import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useWebcam } from './useWebcam';
import {
  createPeerConnection,
  createHostOffer,
  acceptAnswer,
} from '../utils/webrtcSignaling';

export type CameraSource = 'local' | 'remote';

export type RemoteStatus =
  | 'idle'        // まだ開始していない
  | 'offering'    // offer 生成中
  | 'waiting'     // offer 表示済み、スマホからの answer 待ち
  | 'connecting'  // answer 適用済み、ICE 接続中
  | 'connected'   // 映像受信中
  | 'failed';     // 失敗/切断

export interface UseCameraSourceResult {
  stream: MediaStream | null;
  error: string | null;
  /** 内向きカメラ(local)は鏡像にすべき。背面スマホ(remote)はミラー不要。 */
  isMirrored: boolean;
  // --- remote (WebRTC 手動シグナリング) 用 ---
  remoteStatus: RemoteStatus;
  /** PC が生成した offer (エンコード済み)。QR / コピペでスマホへ渡す。 */
  offer: string | null;
  /** スマホから受け取った answer を適用して接続を確立する。 */
  submitAnswer: (encodedAnswer: string) => Promise<void>;
  /** remote 接続をやり直す (offer 再生成)。 */
  restartRemote: () => void;
}

/**
 * カメラソース ('local' = 内蔵/USB, 'remote' = スマホ WebRTC) を統合的に扱い、
 * 得られた MediaStream を videoRef に流すフック。
 *
 * 下流の解析パイプライン (HandTracker 等) は videoRef の <video> をそのまま読むため、
 * このフックがソースを差し替えるだけで解析側は無変更で動作する。
 */
export function useCameraSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  source: CameraSource
): UseCameraSourceResult {
  // local ソース: 既存 useWebcam に委譲。enabled=false で remote 時はカメラ取得しない。
  const local = useWebcam(videoRef, 'user', source === 'local');

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [offer, setOffer] = useState<string | null>(null);
  const [restartNonce, setRestartNonce] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);

  // remote モードの開始: offer を生成し、トラック受信を待ち受ける。
  useEffect(() => {
    if (source !== 'remote') return;

    let cancelled = false;
    const pc = createPeerConnection();
    pcRef.current = pc;
    // この effect は source / restartNonce 変化時にのみ走り、WebRTC という外部システムの
    // セットアップを行う (React 公式が許可する「外部システムへの購読開始」ケース)。
    // 毎レンダーでは走らないため cascading render の懸念はない。
    /* eslint-disable react-hooks/set-state-in-effect */
    setRemoteStatus('offering');
    setRemoteError(null);
    setOffer(null);
    setRemoteStream(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    pc.ontrack = (e) => {
      if (cancelled) return;
      setRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
    };

    pc.onconnectionstatechange = () => {
      if (cancelled) return;
      switch (pc.connectionState) {
        case 'connected':
          setRemoteStatus('connected');
          break;
        case 'failed':
        case 'disconnected':
        case 'closed':
          setRemoteStatus('failed');
          break;
      }
    };

    createHostOffer(pc)
      .then((encoded) => {
        if (cancelled) return;
        setOffer(encoded);
        setRemoteStatus('waiting');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to create host offer:', err);
        setRemoteError(err instanceof Error ? err.message : 'Failed to create offer.');
        setRemoteStatus('failed');
      });

    return () => {
      cancelled = true;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    };
  }, [source, restartNonce]);

  // 取得できた stream を videoRef に流し込む (local/remote 共通の出口)。
  const activeStream = source === 'local' ? local.stream : remoteStream;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== activeStream) {
      video.srcObject = activeStream;
      if (activeStream) {
        video.play().catch((e) => console.error('Failed to play camera video:', e));
      }
    }
  }, [activeStream, videoRef]);

  const submitAnswer = useCallback(async (encodedAnswer: string) => {
    const pc = pcRef.current;
    if (!pc) {
      setRemoteError('No active connection. Please restart.');
      return;
    }
    try {
      setRemoteStatus('connecting');
      await acceptAnswer(pc, encodedAnswer);
    } catch (err) {
      console.error('Failed to accept answer:', err);
      setRemoteError(err instanceof Error ? err.message : 'Invalid answer code.');
      setRemoteStatus('failed');
    }
  }, []);

  const restartRemote = useCallback(() => {
    setRestartNonce((n) => n + 1);
  }, []);

  return {
    stream: activeStream,
    error: source === 'local' ? local.error : remoteError,
    isMirrored: source === 'local',
    remoteStatus,
    offer,
    submitAnswer,
    restartRemote,
  };
}
