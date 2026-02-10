'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LOCALE,
  detectLocaleFromNavigator,
  messages,
  type Locale,
  SUPPORTED_LOCALES,
} from './messages'

const STORAGE_KEY = 'dringdring.locale'

type LanguageContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOCALE
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale
    }
    return detectLocaleFromNavigator(window.navigator.language)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
  }

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => {
      const raw = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key
      if (!params) return raw
      return raw.replace(/\{(\w+)\}/g, (_, token: string) => {
        const value = params[token]
        return value === undefined || value === null ? `{${token}}` : String(value)
      })
    }
  }, [locale])

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
