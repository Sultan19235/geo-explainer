"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { STRINGS, type Lang, type StringKey } from "./strings";

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "geo-explainer:lang";
const DEFAULT_LANG: Lang = "kz";

function isLang(value: unknown): value is Lang {
  return value === "kz" || value === "ru";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLang(stored) && stored !== DEFAULT_LANG) {
        setLangState(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

type StringValue = (typeof STRINGS)["kz"][StringKey];

export function useT(): {
  t: <K extends StringKey>(key: K) => (typeof STRINGS)["kz"][K];
  lang: Lang;
} {
  const { lang } = useLanguage();
  const t = useCallback(
    <K extends StringKey>(key: K) =>
      STRINGS[lang][key] as (typeof STRINGS)["kz"][K],
    [lang],
  );
  return { t, lang };
}

export type { StringValue };
