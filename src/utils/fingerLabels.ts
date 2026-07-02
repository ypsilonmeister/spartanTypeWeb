export function translateFingerName(finger: string | string[]): string {
  const map: Record<string, string> = {
    LeftPinky: '左手小指',
    LeftRing: '左手薬指',
    LeftMiddle: '左手中指',
    LeftIndex: '左手人差し指',
    LeftThumb: '左手親指',
    RightThumb: '右手親指',
    RightIndex: '右手人差し指',
    RightMiddle: '右手中指',
    RightRing: '右手薬指',
    RightPinky: '右手小指',
    Unknown: '不明'
  };

  if (Array.isArray(finger)) {
    return finger.map(x => map[x] || x).join(' または ');
  }
  return map[finger] || finger;
}
