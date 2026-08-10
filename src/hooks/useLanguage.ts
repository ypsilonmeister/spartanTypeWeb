import { useContext } from 'react';
import { LanguageContext } from '../i18n/languageContext';
import type { LanguageContextValue } from '../i18n/languageContext';

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
