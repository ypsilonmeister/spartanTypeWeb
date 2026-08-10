import React, { useCallback, useMemo, useState } from 'react';
import { LanguageContext, detectLang, storeLang } from '../i18n/languageContext';
import type { LanguageContextValue } from '../i18n/languageContext';
import type { Lang } from '../types/i18n';
import { translations } from '../i18n/translations';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    storeLang(next);
    setLangState(next);
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = translations[lang];
    const t = (key: string, vars?: Record<string, string | number>) => {
      let str = dict[key] ?? translations.ja[key] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          str = str.replaceAll(`{{${name}}}`, String(replacement));
        }
      }
      return str;
    };
    return { lang, setLang, t };
  }, [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
