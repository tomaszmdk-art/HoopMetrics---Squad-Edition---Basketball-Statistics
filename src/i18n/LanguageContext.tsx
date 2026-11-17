import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Language,
  SUPPORTED_LANGUAGES,
  LanguageOption,
  TranslationKey,
  getTranslation,
} from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, fallback?: string) => string;
  supportedLanguages: LanguageOption[];
}

const STORAGE_KEY = 'basketstats_lang';

const LanguageContext = createContext<LanguageContextType>({
  language: 'en', // ENGLISH MUST BE DEFAULT
  setLanguage: () => {},
  t: (key) => key,
  supportedLanguages: SUPPORTED_LANGUAGES,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // English is the default language as requested: "Wersja angielska ma być wersją domyślną"
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['en', 'pl', 'de', 'fr', 'zh', 'it'].includes(stored)) {
        return stored as Language;
      }
    } catch {
      // ignore
    }
    return 'en';
  });

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // ignore
    }
  }, [language]);

  const t = (key: TranslationKey, fallback?: string): string => {
    const translated = getTranslation(key, language);
    if (translated === key && fallback) {
      return fallback;
    }
    return translated;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        supportedLanguages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
