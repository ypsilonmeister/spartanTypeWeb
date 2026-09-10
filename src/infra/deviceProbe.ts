/**
 * dev 専用のデバイス能力プローブ (メインスレッド側)。
 *
 * 低スペック実機の「解析が遅い」原因を、スペック表の推測ではなく端末自身に答えさせる。
 * 呼び出し元は probe.html 専用エントリだけで、本番ビルドには含まれない。
 */
import { selectSupportedRecordingMimeType } from '../utils/mediaRecording';
import { detectWasmSimd, detectWasmThreads } from './deviceProbeProtocol';

// useSessionRecorder.ts の RECORDING_MAX_WIDTH / RECORDING_FPS と一致させること。
// ここがズレると「実際に録画される条件」を測れなくなる。
const RECORDING_MAX_WIDTH = 960;
const RECORDING_FPS = 15;
const RECORDING_FRAME_INTERVAL_MS = 1000 / RECORDING_FPS;

const getEvenSize = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export interface DeviceBasics {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  devicePixelRatio: number;
  screen: string;
  secureContext: boolean;
  crossOriginIsolated: boolean;
}

export function probeDeviceBasics(): DeviceBasics {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    deviceMemoryGB: nav.deviceMemory ?? null,
    devicePixelRatio: window.devicePixelRatio,
    screen: `${window.screen.width}x${window.screen.height}`,
    secureContext: window.isSecureContext,
    crossOriginIsolated: window.crossOriginIsolated,
  };
}

export interface WebGLInfo {
  webgl1: boolean;
  webgl2: boolean;
  renderer: string | null;
  vendor: string | null;
  maxTextureSize: number | null;
}

export function probeMainThreadWebGL(): WebGLInfo {
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl2')
    ?? canvas.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null;

  if (!gl) {
    return { webgl1: false, webgl2: false, renderer: null, vendor: null, maxTextureSize: null };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl1: true,
    webgl2: canvas.getContext('webgl2') !== null,
    renderer: debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string),
    vendor: debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string)
      : (gl.getParameter(gl.VENDOR) as string),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
  };
}

export interface WasmInfo {
  simd: boolean;
  threads: boolean;
}

export function probeWasm(): WasmInfo {
  return { simd: detectWasmSimd(), threads: detectWasmThreads() };
}

/** 録画に使える MIME タイプ。アプリが実際に選ぶものも併記する。 */
export interface RecordingCodecInfo {
  supported: Record<string, boolean>;
  selectedByApp: string | null;
}

const CODEC_CANDIDATES = [
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm;codecs=av01',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
];

export function probeRecordingCodecs(): RecordingCodecInfo {
  if (typeof MediaRecorder === 'undefined'
    || typeof MediaRecorder.isTypeSupported !== 'function') {
    return { supported: {}, selectedByApp: null };
  }

  const isSupported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
  const supported: Record<string, boolean> = {};
  for (const candidate of CODEC_CANDIDATES) {
    supported[candidate] = isSupported(candidate);
  }

  return { supported, selectedByApp: selectSupportedRecordingMimeType(isSupported) ?? null };
}

/**
 * WebCodecs によるデコード可否。
 *
 * 注意: 仕様上 hardwareAcceleration は「希望」であって、prefer-hardware で
 * supported:true が返ってもソフトウェアデコードの可能性がある。あくまで参考値で、
 * 決定的な判断は measureDecodeThroughput() の実測で行うこと。
 */
export interface WebCodecsInfo {
  available: boolean;
  results: Record<string, string>;
}

const DECODE_CANDIDATES = [
  { label: 'vp8', codec: 'vp8' },
  { label: 'vp9', codec: 'vp09.00.10.08' },
  { label: 'h264', codec: 'avc1.42E01E' },
  { label: 'hevc', codec: 'hev1.1.6.L93.B0' },
];

export async function probeWebCodecs(width = 960, height = 540): Promise<WebCodecsInfo> {
  const decoderCtor = (globalThis as { VideoDecoder?: typeof VideoDecoder }).VideoDecoder;
  if (!decoderCtor) return { available: false, results: {} };

  const results: Record<string, string> = {};
  for (const { label, codec } of DECODE_CANDIDATES) {
    for (const preference of ['prefer-hardware', 'prefer-software'] as const) {
      try {
        const support = await decoderCtor.isConfigSupported({
          codec,
          codedWidth: width,
          codedHeight: height,
          hardwareAcceleration: preference,
        });
        results[`${label} (${preference})`] = support.supported ? 'supported' : 'unsupported';
      } catch (err) {
        results[`${label} (${preference})`] =
          `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  return { available: true, results };
}

export interface CpuBenchResult {
  mathMs: number;
  memoryMs: number;
}

/**
 * ごく粗い CPU 速度の目安。開発機との比率を取り、PC 側 CPU スロットリングの
 * 倍率を合わせるために使う。MediaPipe 実測が取れるならそちらが優先。
 */
export function runCpuMicroBench(): CpuBenchResult {
  const MATH_ITERATIONS = 4_000_000;
  const ARRAY_SIZE = 4_000_000;

  // ウォームアップ (JIT を安定させる)
  let warm = 0;
  for (let i = 1; i <= 100_000; i++) warm += Math.sqrt(i) * Math.sin(i);
  if (!Number.isFinite(warm)) throw new Error('warmup failed');

  const mathStart = performance.now();
  let acc = 0;
  for (let i = 1; i <= MATH_ITERATIONS; i++) {
    acc += Math.sqrt(i) * Math.sin(i) / ((i % 7) + 1);
  }
  const mathMs = performance.now() - mathStart;

  // LPDDR4X シングルチャネル等のメモリ帯域を粗く見る。
  const buffer = new Float32Array(ARRAY_SIZE);
  const memoryStart = performance.now();
  for (let i = 0; i < ARRAY_SIZE; i++) buffer[i] = i * 0.5;
  let sum = 0;
  for (let i = 0; i < ARRAY_SIZE; i++) sum += buffer[i];
  const memoryMs = performance.now() - memoryStart;

  if (!Number.isFinite(acc) || !Number.isFinite(sum)) {
    throw new Error('cpu bench produced a non-finite result');
  }

  return { mathMs, memoryMs };
}

/**
 * 計測用フレームの供給元。
 *
 * LAN の http:// は secure context ではないため実機では getUserMedia が失敗しうる。
 * デコード実測にカメラ映像は本質的に不要 (コーデック・解像度・ビットレートが同じなら
 * 十分) なので、合成フレームでも計測できるようにしてある。
 */
export type ProbeFrameSource =
  | { kind: 'camera'; video: HTMLVideoElement }
  | { kind: 'synthetic' };

const SYNTHETIC_SIZE = { width: 1280, height: 720 };

function getSourceSize(source: ProbeFrameSource) {
  if (source.kind === 'synthetic') return SYNTHETIC_SIZE;
  return {
    width: source.video.videoWidth || 640,
    height: source.video.videoHeight || 480,
  };
}

/**
 * 合成フレーム。エンコーダ / デコーダに現実的な負荷をかけるため、
 * 毎フレーム変化する要素と細かいノイズを含める (単色だと圧縮が効きすぎて
 * デコード実測が楽になりすぎる)。
 */
function drawSyntheticFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tick: number
) {
  const phase = tick * 0.05;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${(tick * 2) % 360}, 60%, 25%)`);
  gradient.addColorStop(1, `hsl(${(tick * 2 + 120) % 360}, 60%, 10%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 動く円 (動きベクトルを発生させ、フレーム間予測を効きにくくする)
  for (let i = 0; i < 12; i++) {
    const angle = phase + (i * Math.PI) / 6;
    const radius = Math.min(width, height) * 0.3;
    ctx.beginPath();
    ctx.arc(
      width / 2 + Math.cos(angle) * radius,
      height / 2 + Math.sin(angle * 1.3) * radius,
      Math.min(width, height) * 0.06,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `hsl(${(i * 30 + tick * 3) % 360}, 80%, 55%)`;
    ctx.fill();
  }

  // 高周波成分 (圧縮しにくくする)
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(
      (Math.random() * width) | 0,
      (Math.random() * height) | 0,
      2,
      2
    );
  }
}

function drawSourceFrame(
  ctx: CanvasRenderingContext2D,
  source: ProbeFrameSource,
  width: number,
  height: number,
  tick: number
) {
  if (source.kind === 'camera') {
    if (source.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.drawImage(source.video, 0, 0, width, height);
    }
    return;
  }
  drawSyntheticFrame(ctx, width, height, tick);
}

export interface RecordedSample {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  requestedMs: number;
  recordingSize: string;
  sourceKind: ProbeFrameSource['kind'];
}

/**
 * アプリと同じ条件 (キャンバスへ縮小 → captureStream → MediaRecorder) で短い動画を録る。
 * 解析パイプラインが実際に食わされる Blob を再現するのが目的。
 */
export function recordSample(
  source: ProbeFrameSource,
  canvas: HTMLCanvasElement,
  durationMs: number
): Promise<RecordedSample> {
  return new Promise((resolve, reject) => {
    const { width: sourceWidth, height: sourceHeight } = getSourceSize(source);
    const scale = sourceWidth > RECORDING_MAX_WIDTH ? RECORDING_MAX_WIDTH / sourceWidth : 1;
    const width = getEvenSize(sourceWidth * scale);
    const height = getEvenSize(sourceHeight * scale);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not create probe canvas context.'));
      return;
    }

    // アプリと同じく、描画を録画レートに間引く。
    let rafId = 0;
    let tick = 0;
    let lastDrawAt = -Infinity;
    const drawFrame = (now: number) => {
      if (now - lastDrawAt >= RECORDING_FRAME_INTERVAL_MS) {
        drawSourceFrame(ctx, source, width, height, tick++);
        lastDrawAt = now;
      }
      rafId = requestAnimationFrame(drawFrame);
    };
    drawFrame(performance.now());

    const recordingStream = canvas.captureStream(RECORDING_FPS);
    const mimeType = selectSupportedRecordingMimeType(
      MediaRecorder.isTypeSupported.bind(MediaRecorder)
    );
    const options: MediaRecorderOptions = { videoBitsPerSecond: 1_500_000 };
    if (mimeType) options.mimeType = mimeType;

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(recordingStream, options);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      cancelAnimationFrame(rafId);
      recordingStream.getTracks().forEach((track) => track.stop());
      reject(new Error(`MediaRecorder failed: ${String(event)}`));
    };
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      recordingStream.getTracks().forEach((track) => track.stop());
      const type = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || 'video/webm';
      const blob = new Blob(chunks, { type });
      resolve({
        blob,
        mimeType: type,
        sizeBytes: blob.size,
        requestedMs: durationMs,
        recordingSize: `${width}x${height}`,
        sourceKind: source.kind,
      });
    };

    recorder.start(1000);
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
}

export interface DecodeThroughputResult {
  /** 再生に掛かった実時間 (秒)。 */
  wallSec: number;
  /** 再生できた動画内の時間 (秒)。 */
  playedSec: number;
  /** playedSec / wallSec。playbackRate に届いていなければデコードが追いついていない。 */
  realtimeFactor: number;
  requestedPlaybackRate: number;
  /** 実際に提示されたフレーム数。 */
  presentedFrames: number;
  /** presentedFrames / wallSec。 */
  presentedFpsWall: number;
  frameCallback: 'requestVideoFrameCallback' | 'requestAnimationFrame';
  timedOut: boolean;
}

type VideoWithCallback = HTMLVideoElement & {
  requestVideoFrameCallback: (callback: () => void) => number;
};

/**
 * 録画した Blob を解析と同じ playbackRate で再生し、デコードが追いつくかを実測する。
 *
 * これが解析パイプラインの「デコード段が壁かどうか」の決定打になる。
 * realtimeFactor が playbackRate に届いていなければ、MediaPipe を幾ら速くしても
 * 解析時間は縮まない。
 */
export function measureDecodeThroughput(
  blob: Blob,
  playbackRate: number,
  timeoutMs = 60_000
): Promise<DecodeThroughputResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(blob);

    const hasFrameCallback = 'requestVideoFrameCallback' in video;
    let presentedFrames = 0;
    let lastSeenTime = -1;
    let startedAt = 0;
    let settled = false;
    let timeoutId = 0;

    const finish = (timedOut: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);

      const wallSec = (performance.now() - startedAt) / 1000;
      const playedSec = Number.isFinite(video.currentTime) ? video.currentTime : 0;

      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);

      resolve({
        wallSec,
        playedSec,
        realtimeFactor: wallSec > 0 ? playedSec / wallSec : 0,
        requestedPlaybackRate: playbackRate,
        presentedFrames,
        presentedFpsWall: wallSec > 0 ? presentedFrames / wallSec : 0,
        frameCallback: hasFrameCallback ? 'requestVideoFrameCallback' : 'requestAnimationFrame',
        timedOut,
      });
    };

    const requestNextFrame = (callback: () => void) => {
      if (hasFrameCallback) {
        (video as VideoWithCallback).requestVideoFrameCallback(callback);
      } else {
        requestAnimationFrame(callback);
      }
    };

    // 実パイプラインと同じく「新しく提示された currentTime」だけを 1 フレームと数える。
    const onFrame = () => {
      if (settled) return;
      if (video.currentTime !== lastSeenTime) {
        lastSeenTime = video.currentTime;
        presentedFrames++;
      }
      if (video.ended || video.paused) {
        finish(false);
        return;
      }
      requestNextFrame(onFrame);
    };

    video.addEventListener('ended', () => finish(false));
    video.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode the recorded sample.'));
    });

    video.addEventListener('loadeddata', () => {
      video.playbackRate = playbackRate;
      startedAt = performance.now();
      video.play()
        .then(() => requestNextFrame(onFrame))
        .catch((err) => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(url);
          reject(err);
        });
    });

    timeoutId = window.setTimeout(() => finish(true), timeoutMs);
    video.src = url;
  });
}

/**
 * 推論ベンチ用のフレームを、指定した幅にリサイズして ImageBitmap 化する。
 *
 * 合成フレームだと手が検出されず landmark モデルが走らないため、推論時間は
 * 過小評価になる。呼び出し側は結果の handsDetected を必ず確認すること。
 */
export async function captureBenchFrame(
  source: ProbeFrameSource,
  canvas: HTMLCanvasElement,
  targetWidth: number
): Promise<ImageBitmap> {
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(source);
  const width = getEvenSize(targetWidth);
  const height = getEvenSize((sourceHeight / sourceWidth) * targetWidth);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create probe canvas context.');

  drawSourceFrame(ctx, source, width, height, 0);
  return createImageBitmap(canvas);
}
