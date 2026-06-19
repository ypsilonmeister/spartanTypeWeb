import pako from 'pako';

/**
 * サーバー不要の手動シグナリングによる WebRTC ヘルパー。
 *
 * 接続モデル:
 *   - PC = host: offer を作成し、スマホから映像トラックを **受信** する (recvonly)。
 *   - スマホ = guest: 背面カメラのトラックを **送信** し、answer を返す (sendonly)。
 *
 * シグナリングはサーバーを使わず、SDP を圧縮 (deflate) → base64url 化した
 * 文字列を QR / コピペで手動交換する。trickle ICE は使わず、ICE 収集完了を
 * 待ってから「全候補入りの 1 つの SDP」を吐き出すことで一発交換を単純化する
 * (vanilla ICE)。同一 LAN 前提のため STUN のみ・TURN なし。
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** SDP 等の文字列を deflate 圧縮し、URL セーフな base64 にする。 */
export function encodeSignal(text: string): string {
  const compressed = pako.deflate(text);
  let binary = '';
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** encodeSignal の逆。base64url → deflate 解凍して元の文字列へ戻す。 */
export function decodeSignal(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return pako.inflate(bytes, { to: 'string' });
}

/**
 * ICE 収集が完了するまで待ち、全候補を含んだ localDescription を返す。
 * 既に complete の場合は即座に解決する。安全のためタイムアウトも設ける。
 */
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 8000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    // 一部ブラウザでは icegatheringstatechange が complete まで発火しないことがあるため、
    // null candidate の到着もフォールバックとして監視する。
    const onCandidate = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) {
        pc.removeEventListener('icecandidate', onCandidate);
        done();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    pc.addEventListener('icecandidate', onCandidate);
    const timer = setTimeout(done, timeoutMs); // 取りこぼし保険
  });
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

/**
 * PC (host) 側: 映像を受信する offer を生成し、エンコード済み文字列を返す。
 * 返り値の文字列を QR/コピペでスマホに渡す。
 */
export async function createHostOffer(pc: RTCPeerConnection): Promise<string> {
  // スマホからの映像を受信したいので recvonly のトランシーバを追加する。
  pc.addTransceiver('video', { direction: 'recvonly' });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  if (!pc.localDescription) throw new Error('Failed to create local offer description');
  return encodeSignal(JSON.stringify(pc.localDescription));
}

/**
 * PC (host) 側: スマホから受け取ったエンコード済み answer を適用する。
 */
export async function acceptAnswer(pc: RTCPeerConnection, encodedAnswer: string): Promise<void> {
  const answer = JSON.parse(decodeSignal(encodedAnswer.trim())) as RTCSessionDescriptionInit;
  await pc.setRemoteDescription(answer);
}

/**
 * スマホ (guest) 側: PC の offer を適用し、自分のカメラ stream を送信する
 * answer を生成して返す。返り値の文字列を QR/コピペで PC に渡す。
 */
export async function createGuestAnswer(
  pc: RTCPeerConnection,
  encodedOffer: string,
  stream: MediaStream
): Promise<string> {
  const offer = JSON.parse(decodeSignal(encodedOffer.trim())) as RTCSessionDescriptionInit;

  // 自分のカメラトラックを送信側として載せる。
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);

  if (!pc.localDescription) throw new Error('Failed to create local answer description');
  return encodeSignal(JSON.stringify(pc.localDescription));
}
