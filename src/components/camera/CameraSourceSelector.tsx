import React, { useMemo, useState } from 'react';
import type { CameraSource, RemoteStatus } from '../../hooks/useCameraSource';
import { useLanguage } from '../../hooks/useLanguage';
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

const STATUS_KEY: Record<RemoteStatus, { key: string; cls: string } | null> = {
  idle: null,
  offering: { key: 'camera.status.offering', cls: 'is-waiting' },
  waiting: { key: 'camera.status.waiting', cls: 'is-waiting' },
  connecting: { key: 'camera.status.connecting', cls: 'is-waiting' },
  connected: { key: 'camera.status.connected', cls: 'is-connected' },
  failed: { key: 'camera.status.failed', cls: 'is-failed' },
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
  const { t } = useLanguage();
  const [answerInput, setAnswerInput] = useState('');
  const phoneUrl = useMemo(() => (offer ? buildPhoneUrl(offer) : null), [offer]);
  const statusEntry = STATUS_KEY[remoteStatus];
  const isConnected = remoteStatus === 'connected';

  return (
    <div className="cam-source cam-source-full">
      {/* ソース切替トグル */}
      <div className={`cam-source-toggle${source === 'remote' ? ' has-remote-margin' : ''}`}>
        <button
          className={`cam-btn cam-btn-secondary cam-source-toggle-btn${source === 'local' ? ' is-active' : ''}`}
          onClick={() => onSourceChange('local')}
        >
          {t('camera.pcCamera')}
        </button>
        <button
          className={`cam-btn cam-btn-secondary cam-source-toggle-btn${source === 'remote' ? ' is-active' : ''}`}
          onClick={() => onSourceChange('remote')}
        >
          {t('camera.phoneCamera')}
        </button>
      </div>

      {source === 'remote' && (
        <div className="cam-card cam-card-wide">
          {statusEntry && <div className={`cam-status ${statusEntry.cls}`}>{t(statusEntry.key)}</div>}

          {!isConnected && (
            <>
              <div className="cam-step-label cam-step-label-spaced">
                {t('camera.step1')}
              </div>
              <p className="cam-hint">
                {t('camera.step1Hint')}
              </p>
              {phoneUrl ? (
                <div className="cam-qr-wrap">
                  <QRCodeView value={phoneUrl} size={240} />
                </div>
              ) : (
                <div className="cam-status is-waiting">{t('camera.generatingCode')}</div>
              )}
              {phoneUrl && (
                <details>
                  <summary className="cam-hint cam-details-summary">
                    {t('camera.manualUrlSummary')}
                  </summary>
                  <textarea className="cam-textarea" readOnly value={phoneUrl} onFocus={(e) => e.target.select()} />
                </details>
              )}

              <div className="cam-step-label cam-step-label-large-spaced">
                {t('camera.step2')}
              </div>
              <p className="cam-hint">{t('camera.step2Hint')}</p>
              <textarea
                className="cam-textarea"
                placeholder={t('camera.answerPlaceholder')}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
              />
              <div className="cam-actions">
                <button
                  className="cam-btn cam-action-main"
                  disabled={!answerInput.trim()}
                  onClick={() => onSubmitAnswer(answerInput.trim())}
                >
                  {t('camera.connectBtn')}
                </button>
                <button className="cam-btn cam-btn-secondary cam-action-secondary" onClick={onRestart}>
                  {t('camera.retryBtn')}
                </button>
              </div>
            </>
          )}

          {isConnected && (
            <p className="cam-hint cam-hint-spaced">
              {t('camera.connectedHint')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
