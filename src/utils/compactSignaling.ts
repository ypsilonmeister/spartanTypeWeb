/**
 * SDP ⇄ コンパクト形式の相互変換。
 *
 * WebRTC の SDP は冗長で、そのまま QR に入れると超高密度 (version 17+) になり
 * スマホ画面越しでは読み取れない。このユーティリティは video 1 本・BUNDLE・
 * rtcp-mux 前提の規則的な SDP から「接続に必須な可変要素」だけを抜き出し、
 * 受信側で正準テンプレートに再構築することで、QR を version 8 程度まで小さくする。
 *
 * 抽出する必須要素:
 *   - ice-ufrag / ice-pwd (ICE 認証)
 *   - DTLS fingerprint (改ざん防止に必須)
 *   - setup (actpass / active / passive)
 *   - host candidate の ip:port (同一 LAN 直結用に 1 つだけ)
 *   - 方向 (offer=recvonly / answer=sendonly)
 *
 * 固定値 (テンプレート側で再構築):
 *   - session-level 行、payload は VP8(96)+rtx(97) 固定、mid=0、UDP/TLS/RTP/SAVPF。
 */

export interface CompactSignal {
  /** type: 'o' = offer, 'a' = answer */
  t: 'o' | 'a';
  /** ice-ufrag */
  u: string;
  /** ice-pwd */
  p: string;
  /** fingerprint sha-256 (コロン除去の hex) */
  f: string;
  /** DTLS setup role */
  s: 'actpass' | 'active' | 'passive';
  /** host/srflx candidate "ip:port" (なければ空) */
  c: string;
}

/** SDP 文字列から必須要素を抽出してコンパクト表現にする。 */
export function sdpToCompact(desc: RTCSessionDescriptionInit): CompactSignal {
  const sdp = desc.sdp ?? '';
  const get = (re: RegExp): string => {
    const m = sdp.match(re);
    return m ? m[1] : '';
  };

  const ufrag = get(/a=ice-ufrag:(\S+)/);
  const pwd = get(/a=ice-pwd:(\S+)/);
  const fp = get(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/).replace(/:/g, '');
  const setupRaw = get(/a=setup:(\w+)/) as CompactSignal['s'];

  // 最初の host candidate を優先、なければ srflx を採用 (ip:port を 1 つだけ)。
  let candidate = '';
  const candLines = sdp.match(/a=candidate:[^\r\n]+/g) ?? [];
  const pick = (typ: string) =>
    candLines.find((l) => l.includes(`typ ${typ}`) && / udp /i.test(l));
  const chosen = pick('host') ?? pick('srflx') ?? candLines[0];
  if (chosen) {
    // 形式: a=candidate:<foundation> <comp> udp <pri> <ip> <port> typ ...
    const parts = chosen.split(/\s+/);
    const ip = parts[4];
    const port = parts[5];
    if (ip && port) candidate = `${ip}:${port}`;
  }

  return {
    t: desc.type === 'answer' ? 'a' : 'o',
    u: ufrag,
    p: pwd,
    f: fp,
    s: setupRaw || 'actpass',
    c: candidate,
  };
}

/** fingerprint hex を `AA:BB:..` 形式に戻す。 */
function formatFingerprint(hex: string): string {
  return (hex.match(/.{1,2}/g) ?? []).join(':').toUpperCase();
}

/** コンパクト表現から SDP を再構築して RTCSessionDescriptionInit にする。 */
export function compactToSdp(sig: CompactSignal): RTCSessionDescriptionInit {
  const isOffer = sig.t === 'o';
  const direction = isOffer ? 'recvonly' : 'sendonly';

  const lines: string[] = [
    'v=0',
    // セッション ID は任意の固定値で良い (相手は照合しない)。
    'o=- 0 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS *',
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
    'c=IN IP4 0.0.0.0',
    'a=rtcp:9 IN IP4 0.0.0.0',
    `a=ice-ufrag:${sig.u}`,
    `a=ice-pwd:${sig.p}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${formatFingerprint(sig.f)}`,
    `a=setup:${sig.s}`,
    'a=mid:0',
    `a=${direction}`,
    'a=rtcp-mux',
    'a=rtpmap:96 VP8/90000',
    'a=rtcp-fb:96 nack',
    'a=rtcp-fb:96 nack pli',
    'a=rtpmap:97 rtx/90000',
    'a=fmtp:97 apt=96',
  ];

  if (sig.c) {
    const [ip, port] = sig.c.split(':');
    // host candidate として 1 つ復元 (foundation/priority は任意の妥当値)。
    lines.push(
      `a=candidate:1 1 udp 2122260223 ${ip} ${port} typ host generation 0`
    );
    lines.push('a=end-of-candidates');
  }

  return {
    type: isOffer ? 'offer' : 'answer',
    sdp: lines.join('\r\n') + '\r\n',
  };
}
