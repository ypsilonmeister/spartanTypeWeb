import { createContext } from 'react';
import type { Lang } from '../types/i18n';

const LANG_STORAGE_KEY = 'spartan_lang';

export function detectLang(): Lang {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === 'en' || stored === 'ja') return stored;
  if (typeof navigator === 'undefined') return 'ja';
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function storeLang(lang: Lang): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
}

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
