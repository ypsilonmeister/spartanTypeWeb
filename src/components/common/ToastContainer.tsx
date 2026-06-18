import React from 'react';
import type { ToastItem } from '../../hooks/useToast';
import '../../styles/toast.css';

interface ToastContainerProps {
  toasts: ToastItem[];
}

const ICONS: Record<string, string> = {
  success: '✓',
  error:   '✗',
  warning: '⚠',
  info:    'ℹ',
};

/**
 * Toast 通知をオーバーレイとして表示するコンポーネント。
 * useToast() フックの toasts 配列を受け取り描画する。
 * 画面右下に最大 5 件まで縦積みで表示される。
 */
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="log" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast__icon" aria-hidden="true">
            {ICONS[toast.type] ?? 'ℹ'}
          </span>
          <span className="toast__message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};
