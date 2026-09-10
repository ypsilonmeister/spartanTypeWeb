import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  captureBenchFrame,
  measureDecodeThroughput,
  probeDeviceBasics,
  probeMainThreadWebGL,
  probeRecordingCodecs,
  probeWasm,
  probeWebCodecs,
  recordSample,
  runCpuMicroBench,
  type CpuBenchResult,
  type DecodeThroughputResult,
  type ProbeFrameSource,
  type RecordedSample,
  type WebCodecsInfo,
} from '../../infra/deviceProbe';
import type {
  ProbeBenchResult,
  ProbeContextResult,
  ProbeInitResult,
  ProbeRequest,
  ProbeResponse,
} from '../../infra/deviceProbeProtocol';
import '../../styles/deviceProbe.css';

/** 解析パイプラインが実際に使う再生倍率 (offlineAnalyzer.ts の ANALYSIS_PLAYBACK_RATE)。 */
const ANALYSIS_PLAYBACK_RATE = 3;
const SAMPLE_RECORDING_MS = 4000;
const BENCH_WIDTHS = [960, 640, 480, 320];
const BENCH_ITERATIONS = 12;

type BenchRow = ProbeBenchResult & { delegate: 'GPU' | 'CPU' };

function sendProbeRequest(
  worker: Worker,
  request: ProbeRequest,
  expectedType: ProbeResponse['type'],
  transfer: Transferable[] = []
): Promise<ProbeResponse> {
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<ProbeResponse>) => {
      const response = event.data;
      if (response.type !== expectedType && response.type !== 'PROBE_ERROR') return;

      worker.removeEventListener('message', handleMessage);
      if (response.type === 'PROBE_ERROR') {
        reject(new Error(response.error));
        return;
      }
      resolve(response);
    };

    worker.addEventListener('message', handleMessage);
    worker.postMessage(request, transfer);
  });
}

const formatMs = (ms: number) => `${ms.toFixed(1)} ms`;

/**
 * dev 専用のデバイス能力プローブ。`?probe=device` で開く。
 *
 * 低スペック実機で解析が遅い原因を切り分けるために、
 * 「GPU デリゲートが初期化できるか」「録画コーデックを 3 倍速でデコードできるか」
 * 「MediaPipe が 1 フレーム何 ms か」を端末自身に実測させる。
 */
export const DeviceProbePage: React.FC = () => {
  const [basics] = useState(probeDeviceBasics);
  const [webgl] = useState(probeMainThreadWebGL);
  const [wasm] = useState(probeWasm);
  const [recordingCodecs] = useState(probeRecordingCodecs);

  const [webCodecs, setWebCodecs] = useState<WebCodecsInfo | null>(null);
  const [workerContext, setWorkerContext] = useState<ProbeContextResult | null>(null);
  const [cpuBench, setCpuBench] = useState<CpuBenchResult | null>(null);
  const [sample, setSample] = useState<RecordedSample | null>(null);
  const [decode, setDecode] = useState<DecodeThroughputResult | null>(null);
  const [initResults, setInitResults] = useState<ProbeInitResult[]>([]);
  const [benchRows, setBenchRows] = useState<BenchRow[]>([]);

  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState('起動時プローブを実行中...');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      // 本番と同じくクラシックワーカー (MediaPipe の importScripts のため)。
      workerRef.current = new Worker(
        new URL('../../workers/deviceProbe.worker.ts', import.meta.url)
      );
    }
    return workerRef.current;
  }, []);

  // 起動時の軽いプローブ (ネットワーク不要)。
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      probeWebCodecs(),
      sendProbeRequest(getWorker(), { type: 'CONTEXT' }, 'CONTEXT_RESULT'),
    ])
      .then(([webCodecsInfo, contextResult]) => {
        if (cancelled) return;
        setWebCodecs(webCodecsInfo);
        setWorkerContext(contextResult as ProbeContextResult);
        setStatus('起動時プローブ完了。下のボタンで実測を追加できます。');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('起動時プローブでエラーが発生しました。');
      });

    return () => {
      cancelled = true;
    };
  }, [getWorker]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const runCpuBench = useCallback(() => {
    setBusy(true);
    setStatus('CPU ベンチ実行中 (数秒 UI が止まります)...');
    // 同期ベンチなので、描画を 1 フレーム挟んでからでないと status が出ない。
    window.setTimeout(() => {
      try {
        setCpuBench(runCpuMicroBench());
        setStatus('CPU ベンチ完了。');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }, 50);
  }, []);

  const enableCamera = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus('カメラを要求中...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setCameraReady(true);
      setStatus('カメラ有効。キーボードの上に手を写した状態で各テストを実行してください。');
    } catch (err) {
      setError(
        `カメラを取得できませんでした: ${err instanceof Error ? err.message : String(err)}`
        + (window.isSecureContext ? '' : ' (このページは secure context ではありません)')
      );
      setStatus('カメラ取得に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, []);

  // カメラが使えない環境 (LAN の http:// 等) でも計測できるよう合成フレームへ落ちる。
  const frameSource = useCallback((): ProbeFrameSource => (
    cameraReady && videoRef.current
      ? { kind: 'camera', video: videoRef.current }
      : { kind: 'synthetic' }
  ), [cameraReady]);

  const runDecodeTest = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    setError(null);
    try {
      setStatus(`アプリと同じ設定で ${SAMPLE_RECORDING_MS / 1000} 秒録画中...`);
      const recorded = await recordSample(frameSource(), canvas, SAMPLE_RECORDING_MS);
      setSample(recorded);

      setStatus(`録画した動画を ${ANALYSIS_PLAYBACK_RATE}x で再生してデコード速度を実測中...`);
      const throughput = await measureDecodeThroughput(recorded.blob, ANALYSIS_PLAYBACK_RATE);
      setDecode(throughput);
      setStatus('デコード実測完了。');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('デコード実測に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [frameSource]);

  const runMediaPipeBench = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    setError(null);
    setInitResults([]);
    setBenchRows([]);

    const worker = getWorker();
    const collectedInits: ProbeInitResult[] = [];
    const collectedRows: BenchRow[] = [];

    try {
      for (const delegate of ['GPU', 'CPU'] as const) {
        setStatus(`${delegate} デリゲートで HandLandmarker を初期化中 (初回はモデル約10MBのDL)...`);
        const initResult = await sendProbeRequest(
          worker,
          { type: 'INIT', delegate },
          'INIT_RESULT'
        ) as ProbeInitResult;

        collectedInits.push(initResult);
        setInitResults([...collectedInits]);
        if (!initResult.ok) continue;

        for (const width of BENCH_WIDTHS) {
          setStatus(`${delegate} / ${width}px を ${BENCH_ITERATIONS} 回推論中...`);
          const bitmap = await captureBenchFrame(frameSource(), canvas, width);
          const benchResult = await sendProbeRequest(
            worker,
            { type: 'BENCH', image: bitmap, iterations: BENCH_ITERATIONS, label: `${width}px` },
            'BENCH_RESULT',
            [bitmap]
          ) as ProbeBenchResult;

          collectedRows.push({ ...benchResult, delegate });
          setBenchRows([...collectedRows]);
        }
      }

      worker.postMessage({ type: 'DISPOSE' } satisfies ProbeRequest);
      setStatus('MediaPipe 実測完了。');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('MediaPipe 実測に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [getWorker, frameSource]);

  const report = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    basics,
    mainThreadWebGL: webgl,
    workerContext,
    wasm,
    recordingCodecs,
    webCodecs,
    cpuBench,
    recordedSample: sample
      ? {
        mimeType: sample.mimeType,
        sizeBytes: sample.sizeBytes,
        requestedMs: sample.requestedMs,
        recordingSize: sample.recordingSize,
        sourceKind: sample.sourceKind,
      }
      : null,
    decodeThroughput: decode,
    mediapipeInit: initResults,
    mediapipeBench: benchRows,
  }), [
    basics, webgl, workerContext, wasm, recordingCodecs, webCodecs,
    cpuBench, sample, decode, initResults, benchRows,
  ]);

  const reportJson = useMemo(() => JSON.stringify(report, null, 2), [report]);

  const copyReport = useCallback(() => {
    console.log('[DeviceProbe]', report);
    navigator.clipboard?.writeText(reportJson)
      .then(() => setStatus('JSON をクリップボードにコピーしました。'))
      .catch(() => setStatus('クリップボードが使えません。下のテキストを選択してコピーしてください。'));
  }, [report, reportJson]);

  const decodeVerdict = decode
    ? decode.realtimeFactor >= ANALYSIS_PLAYBACK_RATE * 0.9
      ? { text: `OK — ${ANALYSIS_PLAYBACK_RATE}x 再生に追いついています`, tone: 'ok' as const }
      : { text: `NG — 実効 ${decode.realtimeFactor.toFixed(2)}x しか出ていません。デコードが解析のボトルネックです`, tone: 'bad' as const }
    : null;

  return (
    <div className="probe-page">
      <header className="probe-header">
        <h1>Device Probe</h1>
        <p className="probe-status">{status}</p>
        {error && <p className="probe-error">{error}</p>}
      </header>

      <section className="probe-card">
        <h2>1. 決定的な項目</h2>
        <dl className="probe-highlights">
          <div>
            <dt>Worker 内 WebGL2 (= GPU デリゲート可否)</dt>
            <dd className={workerContext?.webgl2 ? 'tone-ok' : 'tone-bad'}>
              {workerContext ? (workerContext.webgl2 ? '利用可' : '利用不可 → GPU デリゲートは必ず失敗') : '測定中...'}
            </dd>
          </div>
          <div>
            <dt>GPU (Worker から取得)</dt>
            <dd>{workerContext?.renderer ?? webgl.renderer ?? '不明'}</dd>
          </div>
          <div>
            <dt>WASM SIMD (= CPU デリゲート速度)</dt>
            <dd className={wasm.simd ? 'tone-ok' : 'tone-bad'}>
              {wasm.simd ? '利用可' : '利用不可 → CPU 推論が数倍遅くなります'}
            </dd>
          </div>
          <div>
            <dt>アプリが選ぶ録画コーデック</dt>
            <dd>{recordingCodecs.selectedByApp ?? 'ブラウザ既定'}</dd>
          </div>
        </dl>
      </section>

      <section className="probe-card">
        <h2>2. 端末情報</h2>
        <table className="probe-table">
          <tbody>
            <tr><th>User Agent</th><td className="probe-wrap">{basics.userAgent}</td></tr>
            <tr><th>論理コア数</th><td>{basics.hardwareConcurrency}</td></tr>
            <tr><th>deviceMemory</th><td>{basics.deviceMemoryGB ?? '非対応'} GB</td></tr>
            <tr><th>画面 / DPR</th><td>{basics.screen} / {basics.devicePixelRatio}</td></tr>
            <tr>
              <th>secure context</th>
              <td className={basics.secureContext ? 'tone-ok' : 'tone-warn'}>
                {String(basics.secureContext)}{basics.secureContext ? '' : ' (カメラが使えません)'}
              </td>
            </tr>
            <tr><th>crossOriginIsolated</th><td>{String(basics.crossOriginIsolated)}</td></tr>
            <tr><th>WebGL2 (メイン)</th><td>{String(webgl.webgl2)}</td></tr>
            <tr><th>GPU vendor</th><td>{workerContext?.vendor ?? webgl.vendor ?? '不明'}</td></tr>
            <tr><th>WASM threads</th><td>{String(wasm.threads)}</td></tr>
            <tr><th>OffscreenCanvas (Worker)</th><td>{workerContext ? String(workerContext.offscreenCanvas) : '...'}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="probe-card">
        <h2>3. コーデック対応</h2>
        <table className="probe-table">
          <tbody>
            {Object.entries(recordingCodecs.supported).map(([type, supported]) => (
              <tr key={type}>
                <th className="probe-wrap">MediaRecorder: {type}</th>
                <td className={supported ? 'tone-ok' : 'tone-dim'}>{String(supported)}</td>
              </tr>
            ))}
            {webCodecs && Object.entries(webCodecs.results).map(([label, result]) => (
              <tr key={label}>
                <th>VideoDecoder: {label}</th>
                <td className={result === 'supported' ? 'tone-ok' : 'tone-dim'}>{result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="probe-note">
          VideoDecoder の hardwareAcceleration は仕様上あくまで「希望」で、
          prefer-hardware が supported でもソフトウェアデコードの可能性があります。
          決定打は下の 5. の実測です。
        </p>
      </section>

      <section className="probe-card">
        <h2>4. CPU ベンチ (開発機との比率用)</h2>
        <button className="probe-button" onClick={runCpuBench} disabled={busy}>
          CPU ベンチを実行
        </button>
        {cpuBench && (
          <table className="probe-table">
            <tbody>
              <tr><th>浮動小数演算</th><td>{formatMs(cpuBench.mathMs)}</td></tr>
              <tr><th>メモリ走査</th><td>{formatMs(cpuBench.memoryMs)}</td></tr>
            </tbody>
          </table>
        )}
        <p className="probe-note">
          同じページを開発機で開いて比を取ると、PC 側の CPU スロットリング倍率の目安になります。
        </p>
      </section>

      <section className="probe-card">
        <h2>5. デコード実測 (最重要)</h2>
        <p className="probe-note">
          アプリと同じ経路 (キャンバス縮小 → captureStream → MediaRecorder) で {SAMPLE_RECORDING_MS / 1000} 秒録画し、
          解析と同じ {ANALYSIS_PLAYBACK_RATE}x で再生してデコードが追いつくかを測ります。
          カメラが無くても合成映像で計測できます (コーデック・解像度・ビットレートは同じ)。
        </p>
        <div className="probe-actions">
          <button className="probe-button" onClick={enableCamera} disabled={busy || cameraReady}>
            {cameraReady ? 'カメラ有効' : 'カメラを有効にする'}
          </button>
          <button className="probe-button" onClick={runDecodeTest} disabled={busy}>
            デコード実測を実行
          </button>
        </div>

        <video
          ref={videoRef}
          className={`probe-video${cameraReady ? '' : ' is-hidden'}`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="probe-canvas" />

        {sample && (
          <table className="probe-table">
            <tbody>
              <tr><th>録画 MIME</th><td className="probe-wrap">{sample.mimeType}</td></tr>
              <tr><th>録画サイズ</th><td>{sample.recordingSize} / {(sample.sizeBytes / 1024).toFixed(0)} KB</td></tr>
              <tr><th>映像ソース</th><td>{sample.sourceKind === 'camera' ? 'カメラ' : '合成'}</td></tr>
            </tbody>
          </table>
        )}

        {decode && decodeVerdict && (
          <>
            <p className={`probe-verdict tone-${decodeVerdict.tone}`}>{decodeVerdict.text}</p>
            <table className="probe-table">
              <tbody>
                <tr><th>実効倍率 (playedSec / wallSec)</th><td>{decode.realtimeFactor.toFixed(2)}x</td></tr>
                <tr><th>要求倍率</th><td>{decode.requestedPlaybackRate}x</td></tr>
                <tr><th>再生した動画長</th><td>{decode.playedSec.toFixed(2)} s</td></tr>
                <tr><th>掛かった実時間</th><td>{decode.wallSec.toFixed(2)} s</td></tr>
                <tr><th>提示フレーム数</th><td>{decode.presentedFrames}</td></tr>
                <tr><th>提示 fps (実時間比)</th><td>{decode.presentedFpsWall.toFixed(1)}</td></tr>
                <tr><th>フレームコールバック</th><td>{decode.frameCallback}</td></tr>
                {decode.timedOut && <tr><th>備考</th><td className="tone-warn">タイムアウトで打ち切りました</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="probe-card">
        <h2>6. MediaPipe 実測</h2>
        <p className="probe-note">
          本番と同じクラシックワーカー内で GPU / CPU 両デリゲートの初期化を試し、
          成功したものだけ解像度別に推論時間を測ります。初回はモデル約 10MB をダウンロードします。
          <strong>できればカメラを有効にし、キーボードの上に手を写した状態で実行してください。</strong>
          手が写っていない (合成フレーム) と landmark モデルが走らず、推論時間が過小評価になります。
          下表の「検出手数」が 0 なら、その行は過小評価だと判断してください。
        </p>
        {!cameraReady && (
          <p className="probe-verdict tone-warn">
            カメラが無効です。このまま実行すると合成フレームになり、推論時間は過小評価になります。
          </p>
        )}
        <button className="probe-button" onClick={runMediaPipeBench} disabled={busy}>
          MediaPipe 実測を実行
        </button>

        {initResults.length > 0 && (
          <table className="probe-table">
            <thead>
              <tr><th>デリゲート</th><th>初期化</th><th>時間</th><th>エラー</th></tr>
            </thead>
            <tbody>
              {initResults.map((result) => (
                <tr key={result.delegate}>
                  <td>{result.delegate}</td>
                  <td className={result.ok ? 'tone-ok' : 'tone-bad'}>{result.ok ? '成功' : '失敗'}</td>
                  <td>{formatMs(result.ms)}</td>
                  <td className="probe-wrap">{result.error ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {benchRows.length > 0 && (
          <table className="probe-table">
            <thead>
              <tr>
                <th>デリゲート</th><th>解像度</th><th>定常平均</th>
                <th>初回</th><th>最小</th><th>最大</th><th>検出手数</th>
              </tr>
            </thead>
            <tbody>
              {benchRows.map((row) => (
                <tr key={`${row.delegate}-${row.label}`}>
                  <td>{row.delegate}</td>
                  <td>{row.label}</td>
                  <td><strong>{formatMs(row.steadyAvgMs)}</strong></td>
                  <td>{formatMs(row.firstMs)}</td>
                  <td>{formatMs(row.minMs)}</td>
                  <td>{formatMs(row.maxMs)}</td>
                  <td className={row.handsDetected > 0 ? 'tone-ok' : 'tone-bad'}>
                    {row.handsDetected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="probe-card">
        <h2>7. 結果の持ち帰り</h2>
        <button className="probe-button" onClick={copyReport}>JSON をコピー / コンソールへ出力</button>
        <textarea className="probe-json" readOnly value={reportJson} rows={14} />
      </section>
    </div>
  );
};
