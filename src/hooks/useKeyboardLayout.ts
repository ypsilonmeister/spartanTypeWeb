import { useMemo } from 'react';
import { parseKLE, parseLayoutJSON } from '../utils/kleParser';
import { LAYOUT_PRESETS } from '../assets/layoutTemplates';
import type { LayoutPresetId } from '../assets/layoutTemplates';
import type { KeyboardLayout } from '../types/kle';

/**
 * キーボードレイアウトを解析して返すカスタムフック。
 * App.tsx と CalibrationScreen.tsx で重複していたパース+フォールバックロジックを一元化する。
 *
 * @param presetId     - プリセット ID または 'custom'
 * @param customData   - カスタム JSON データ (KLE または Vial 形式)
 * @param customIsSplit - カスタムレイアウトがスプリット配列かどうか
 */
export function useKeyboardLayout(
  presetId: LayoutPresetId | 'custom',
  customData: unknown | null,
  customIsSplit: boolean
): KeyboardLayout {
  return useMemo(() => {
    if (presetId === 'custom' && customData) {
      try {
        return parseLayoutJSON(JSON.stringify(customData), customIsSplit);
      } catch (e) {
        console.error('Failed to parse custom layout', e);
      }
    }
    const preset =
      LAYOUT_PRESETS[presetId as keyof typeof LAYOUT_PRESETS] ??
      LAYOUT_PRESETS['us-standard'];
    return parseKLE(preset.data, preset.isSplit);
  }, [presetId, customData, customIsSplit]);
}
