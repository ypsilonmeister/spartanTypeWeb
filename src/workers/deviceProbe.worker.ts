/**
 * dev 専用のデバイス能力プローブ用ワーカー。
 *
 * 本番の handTracker.worker.ts と同じ条件 (クラシックワーカー内で MediaPipe を初期化) を
 * 意図的に再現して、GPU デリゲートが実機で本当に初期化できるのか、
 * できないなら CPU デリゲートが何 ms/frame なのかを実測する。
 */
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  createHandLandmarkerOptions,
  MEDIAPIPE_WASM_URL,
} from '../infra/handLandmarkerConfig';
import {
  detectWasmSimd,
  detectWasmThreads,
  type ProbeRequest,
  type ProbeResponse,
} from '../infra/deviceProbeProtocol';

let landmarker: HandLandmarker | null = null;
let benchTimestamp = 0;

function post(response: ProbeResponse) {
  self.postMessage(response);
}

/**
 * ワーカーコンテキストで WebGL2 が使えるかを調べる。
 * MediaPipe の GPU デリゲートはワーカー内の WebGL2 に依存するため、
 * ここが false なら GPU デリゲートは確実に失敗する。
 */
function probeContext() {
  let offscreenCanvas = false;
  let webgl1 = false;
  let webgl2 = false;
  let renderer: string | null = null;
  let vendor: string | null = null;
  let maxTextureSize: number | null = null;

  try {
    const canvas = new OffscreenCanvas(1, 1);
    offscreenCanvas = true;

    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      webgl2 = true;
      webgl1 = true;
      maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE) as number;

      // UNMASKED_RENDERER が取れると GPU 名 (Mali-G57 等) が分かり SoC が特定できる。
      const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        renderer = gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
        vendor = gl2.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
      } else {
        renderer = gl2.getParameter(gl2.RENDERER) as string;
        vendor = gl2.getParameter(gl2.VENDOR) as string;
      }
    } else if (canvas.getContext('webgl')) {
      webgl1 = true;
    }
  } catch (err) {
    console.warn('[DeviceProbe] worker context probe failed:', err);
  }

  post({
    type: 'CONTEXT_RESULT',
    offscreenCanvas,
    webgl1,
    webgl2,
    renderer,
    vendor,
    maxTextureSize,
    wasmSimd: detectWasmSimd(),
    wasmThreads: detectWasmThreads(),
    hardwareConcurrency: self.navigator.hardwareConcurrency ?? 0,
  });
}

/**
 * 指定デリゲートで HandLandmarker を初期化し、掛かった時間を返す。
 * 本番と違いフォールバックはせず、成否をそのまま報告する。
 */
async function probeInit(delegate: 'GPU' | 'CPU') {
  const start = performance.now();
  try {
    landmarker?.close();
    landmarker = null;

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
    landmarker = await HandLandmarker.createFromOptions(
      vision,
      createHandLandmarkerOptions(delegate)
    );

    post({ type: 'INIT_RESULT', delegate, ok: true, ms: performance.now() - start });
  } catch (err) {
    landmarker = null;
    post({
      type: 'INIT_RESULT',
      delegate,
      ok: false,
      ms: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 同じフレームを iterations 回推論して ms/frame を測る。
 *
 * VIDEO モードはトラッキングが効くため 2 回目以降は palm detection を省いて速くなる。
 * これは実パイプライン (連続フレーム) と同じ条件なので、定常状態の平均を主指標とし、
 * 1 回目 (コールド) は別途返す。
 */
function probeBench(image: ImageBitmap, iterations: number, label: string) {
  if (!landmarker) {
    image.close();
    post({ type: 'PROBE_ERROR', error: 'HandLandmarker is not initialized.' });
    return;
  }

  const samples: number[] = [];
  let handsDetected = 0;

  try {
    for (let i = 0; i < iterations; i++) {
      benchTimestamp += 40;
      const start = performance.now();
      const results = landmarker.detectForVideo(image, benchTimestamp);
      samples.push(performance.now() - start);
      handsDetected = results.landmarks?.length ?? 0;
    }
  } catch (err) {
    image.close();
    post({
      type: 'PROBE_ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  image.close();

  const steady = samples.length > 1 ? samples.slice(1) : samples;
  post({
    type: 'BENCH_RESULT',
    label,
    iterations,
    firstMs: samples[0],
    steadyAvgMs: steady.reduce((sum, ms) => sum + ms, 0) / steady.length,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    handsDetected,
  });
}

self.onmessage = (event: MessageEvent<ProbeRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'CONTEXT':
      probeContext();
      break;
    case 'INIT':
      probeInit(request.delegate);
      break;
    case 'BENCH':
      probeBench(request.image, request.iterations, request.label);
      break;
    case 'DISPOSE':
      landmarker?.close();
      landmarker = null;
      break;
  }
};
