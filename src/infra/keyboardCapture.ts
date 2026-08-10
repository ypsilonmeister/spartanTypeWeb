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

    // Space normally scrolls the page or "clicks" whatever button has focus;
    // during a typing session it must only register as a typed character.
    if (event.code === 'Space') {
      event.preventDefault();
    }

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
