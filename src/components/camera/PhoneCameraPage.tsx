import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPeerConnection, createGuestAnswer } from '../../utils/webrtcSignaling';
import { QRCodeView } from './QRCodeView';
import '../../styles/cameraSource.css';

/**
 * スマホ (guest) 側ページ。PC が表示した QR から開かれる。
 *
 * URL 形式: https://<app>/?camera=phone#<encodedOffer>
 *   - offer は URL の hash に載せて渡す (履歴やサーバーログに残りにくく、長さも稼げる)。
 *   - 背面カメラを取得し、PC の offer に対する answer を生成。
 *   - answer を QR + コピペ用テキストで表示し、PC に読み取らせる。
 *
 * PC・スマホとも解析は行わない。スマホはあくまで「上からのカメラ」役。
 */
export const PhoneCameraPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // URL hash から offer を取得 (なければ手動貼り付けに切替)
  const [offerInput, setOfferInput] = useState<string>(() =>
    decodeURIComponent(window.location.hash.replace(/^#/, ''))
  );
  const [phase, setPhase] = useState<'await-offer' | 'starting' | 'answer' | 'connected' | 'error'>(
    'await-offer'
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // グローバルの overflow:hidden / height:100% (メインアプリ用) を、このページの間だけ解除する。
  // :has() 非対応ブラウザでも効くよう、JS で html/body/#root を直接書き換える。
  useEffect(() => {
    document.body.classList.add('phone-camera-active');
    const targets = [
      document.documentElement,
      document.body,
      document.getElementById('root'),
    ].filter(Boolean) as HTMLElement[];
    const prev = targets.map((el) => ({ el, overflow: el.style.overflow, height: el.style.height }));
    targets.forEach((el) => {
      el.style.overflow = 'visible';
      el.style.height = 'auto';
    });
    return () => {
      document.body.classList.remove('phone-camera-active');
      prev.forEach(({ el, overflow, height }) => {
        el.style.overflow = overflow;
        el.style.height = height;
      });
    };
  }, []);

  const startConnection = useCallback(async (encodedOffer: string) => {
    setPhase('starting');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const pc = createPeerConnection();
      pcRef.current = pc;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setPhase('connected');
        else if (['failed', 'closed'].includes(pc.connectionState)) {
          setError('接続が切断されました。');
          setPhase('error');
        }
      };

      const encodedAnswer = await createGuestAnswer(pc, encodedOffer, stream);
      setAnswer(encodedAnswer);
      setPhase('answer');
    } catch (err) {
      console.error('Phone camera connection failed:', err);
      setError(
        err instanceof Error
          ? `${err.message}（カメラ権限を許可し、HTTPS でアクセスしているか確認してください）`
          : 'カメラの取得または接続に失敗しました。'
      );
      setPhase('error');
    }
  }, []);

  // hash に offer があれば自動開始 (マウント時に一度だけ)。
  // startConnection は getUserMedia 等の外部システム起動を伴う非同期処理で、
  // 内部の setState は意図的 (マウント時のみ実行され cascading render にならない)。
  useEffect(() => {
    const initialOffer = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (initialOffer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startConnection(initialOffer);
    }
  }, [startConnection]);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 不可の環境では手動選択にフォールバック */
    }
  };

  return (
    <div className="cam-source cam-page">
      <h1>📱 スマホカメラ接続</h1>

      <div className="cam-card">
        <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
      </div>

      {phase === 'await-offer' && (
        <div className="cam-card">
          <div className="cam-step-label">手順 1: 接続コードを貼り付け</div>
          <p className="cam-hint">
            PC 側に表示された「接続コード」を貼り付けて開始してください。
            （QR から開いた場合は自動で進みます）
          </p>
          <textarea
            className="cam-textarea"
            placeholder="PC の接続コードをここに貼り付け"
            value={offerInput}
            onChange={(e) => setOfferInput(e.target.value)}
          />
          <button
            className="cam-btn"
            disabled={!offerInput.trim()}
            onClick={() => startConnection(offerInput.trim())}
            style={{ marginTop: '0.75rem' }}
          >
            カメラを開始して接続
          </button>
        </div>
      )}

      {phase === 'starting' && (
        <div className="cam-card">
          <div className="cam-status is-waiting">接続準備中...（カメラ権限を許可してください）</div>
        </div>
      )}

      {phase === 'answer' && answer && (
        <div className="cam-card">
          <div className="cam-step-label">手順 2: 応答コードを PC に渡す</div>
          <p className="cam-hint">
            この QR を PC のカメラで読み取るか、下のコードをコピーして PC に貼り付けてください。
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0.75rem 0' }}>
            <QRCodeView value={answer} size={220} />
          </div>
          <textarea className="cam-textarea" readOnly value={answer} onFocus={(e) => e.target.select()} />
          <button className="cam-btn cam-btn-secondary" onClick={copyAnswer} style={{ marginTop: '0.75rem' }}>
            {copied ? '✓ コピーしました' : '応答コードをコピー'}
          </button>
        </div>
      )}

      {phase === 'connected' && (
        <div className="cam-card">
          <div className="cam-status is-connected">✓ 接続完了！ PC に映像を送信中です。</div>
          <p className="cam-hint">このタブは開いたままにしてください。閉じると映像が止まります。</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="cam-card">
          <div className="cam-status is-failed">{error}</div>
          <button
            className="cam-btn"
            onClick={() => {
              setPhase('await-offer');
              setError(null);
            }}
            style={{ marginTop: '0.75rem' }}
          >
            やり直す
          </button>
        </div>
      )}
    </div>
  );
};
