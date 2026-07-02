import React, { useMemo, useState } from 'react';
import type { CameraSource, RemoteStatus } from '../../hooks/useCameraSource';
import { QRCodeView } from './QRCodeView';
import '../../styles/cameraSource.css';

interface CameraSourceSelectorProps {
  source: CameraSource;
  onSourceChange: (source: CameraSource) => void;
  remoteStatus: RemoteStatus;
  offer: string | null;
  onSubmitAnswer: (encodedAnswer: string) => void;
  onRestart: () => void;
}

/** offer を埋め込んだスマホ用 URL を組み立てる (hash に offer を載せる)。 */
function buildPhoneUrl(offer: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?camera=phone#${encodeURIComponent(offer)}`;
}

const STATUS_TEXT: Record<RemoteStatus, { text: string; cls: string }> = {
  idle: { text: '', cls: '' },
  offering: { text: '接続コードを生成中...', cls: 'is-waiting' },
  waiting: { text: 'スマホからの応答を待っています', cls: 'is-waiting' },
  connecting: { text: '接続中...', cls: 'is-waiting' },
  connected: { text: '✓ スマホカメラに接続済み', cls: 'is-connected' },
  failed: { text: '✗ 接続に失敗しました', cls: 'is-failed' },
};

/**
 * PC 側のカメラソース選択 UI。
 * - 'local': PC 内蔵/USB カメラ (UI なし)
 * - 'remote': スマホを WebRTC で接続。offer を QR/コピペで渡し、answer を受け取る。
 */
export const CameraSourceSelector: React.FC<CameraSourceSelectorProps> = ({
  source,
  onSourceChange,
  remoteStatus,
  offer,
  onSubmitAnswer,
  onRestart,
}) => {
  const [answerInput, setAnswerInput] = useState('');
  const phoneUrl = useMemo(() => (offer ? buildPhoneUrl(offer) : null), [offer]);
  const status = STATUS_TEXT[remoteStatus];
  const isConnected = remoteStatus === 'connected';

  return (
    <div className="cam-source cam-source-full">
      {/* ソース切替トグル */}
      <div className={`cam-source-toggle${source === 'remote' ? ' has-remote-margin' : ''}`}>
        <button
          className={`cam-btn cam-btn-secondary cam-source-toggle-btn${source === 'local' ? ' is-active' : ''}`}
          onClick={() => onSourceChange('local')}
        >
          💻 PCのカメラ
        </button>
        <button
          className={`cam-btn cam-btn-secondary cam-source-toggle-btn${source === 'remote' ? ' is-active' : ''}`}
          onClick={() => onSourceChange('remote')}
        >
          📱 スマホのカメラ
        </button>
      </div>

      {source === 'remote' && (
        <div className="cam-card cam-card-wide">
          {status.text && <div className={`cam-status ${status.cls}`}>{status.text}</div>}

          {!isConnected && (
            <>
              <div className="cam-step-label cam-step-label-spaced">
                手順 1: スマホでこの QR を読み取る
              </div>
              <p className="cam-hint">
                スマホのカメラアプリで読み取ると、スマホ側に接続ページが開きます。
                （PC とスマホは同じ Wi-Fi に接続してください）
              </p>
              {phoneUrl ? (
                <div className="cam-qr-wrap">
                  <QRCodeView value={phoneUrl} size={240} />
                </div>
              ) : (
                <div className="cam-status is-waiting">接続コード生成中...</div>
              )}
              {phoneUrl && (
                <details>
                  <summary className="cam-hint cam-details-summary">
                    QR が読めない場合はこの URL を手動で開く
                  </summary>
                  <textarea className="cam-textarea" readOnly value={phoneUrl} onFocus={(e) => e.target.select()} />
                </details>
              )}

              <div className="cam-step-label cam-step-label-large-spaced">
                手順 2: スマホの「応答コード」を貼り付け
              </div>
              <p className="cam-hint">スマホ側に表示された応答コードをコピーして貼り付け、接続してください。</p>
              <textarea
                className="cam-textarea"
                placeholder="スマホの応答コードをここに貼り付け"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
              />
              <div className="cam-actions">
                <button
                  className="cam-btn cam-action-main"
                  disabled={!answerInput.trim()}
                  onClick={() => onSubmitAnswer(answerInput.trim())}
                >
                  接続する
                </button>
                <button className="cam-btn cam-btn-secondary cam-action-secondary" onClick={onRestart}>
                  やり直す
                </button>
              </div>
            </>
          )}

          {isConnected && (
            <p className="cam-hint cam-hint-spaced">
              スマホの映像で解析します。スマホのタブは開いたままにしてください。
            </p>
          )}
        </div>
      )}
    </div>
  );
};
