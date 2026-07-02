export interface CapturedKey {
  key: string;
  code: string;
  timestamp: number;
}

export function subscribeKeyboardCapture(
  onKeyDown: (key: CapturedKey) => void
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;

    onKeyDown({
      key: event.key,
      code: event.code,
      timestamp: performance.now()
    });
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
