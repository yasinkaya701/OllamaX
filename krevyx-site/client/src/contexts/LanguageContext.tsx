/*
 * Krevyx — Language context (TR/EN)
 * Persists choice in localStorage; defaults to EN.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Lang } from "@/lib/i18n";

type TranslationShape = typeof translations.tr;

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TranslationShape;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "krevyx-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "tr" ? "tr" : "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const t = translations[lang];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
