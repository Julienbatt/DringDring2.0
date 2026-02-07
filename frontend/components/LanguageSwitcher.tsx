'use client'

import { SUPPORTED_LOCALES } from '@/lib/i18n/messages'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLanguage()

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'w-full'}`}>
      {!compact ? (
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t('common.language')}
        </span>
      ) : null}
      <div className="flex items-center gap-1">
        {SUPPORTED_LOCALES.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setLocale(entry)}
            className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
              locale === entry
                ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200'
            }`}
            aria-label={t(`common.language.${entry}`)}
            title={t(`common.language.${entry}`)}
          >
            {entry.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}

