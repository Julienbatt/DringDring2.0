'use client'

import { SUPPORTED_LOCALES } from '@/lib/i18n/messages'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLanguage()

  return (
    <div className={`flex items-center gap-2 ${compact ? 'w-auto' : 'w-full'}`}>
      <label
        htmlFor={compact ? 'language-select-compact' : 'language-select'}
        className="text-xs font-semibold uppercase tracking-wider text-slate-500"
      >
        {t('common.language')}
      </label>
      <select
        id={compact ? 'language-select-compact' : 'language-select'}
        value={locale}
        onChange={(e) => setLocale(e.target.value as (typeof SUPPORTED_LOCALES)[number])}
        className={`rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 ${
          compact ? 'min-w-[88px]' : 'w-full'
        }`}
        aria-label={t('common.language')}
      >
        {SUPPORTED_LOCALES.map((entry) => (
          <option key={entry} value={entry}>
            {t(`common.language.${entry}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
