import type { Locale } from './messages'

function toIntlLocale(locale: Locale) {
  if (locale === 'fr') return 'fr-CH'
  if (locale === 'de') return 'de-CH'
  if (locale === 'it') return 'it-CH'
  return 'en-CH'
}

export function formatCurrencyCHF(value: number, locale: Locale) {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(value: Date | string, locale: Locale) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(toIntlLocale(locale)).format(date)
}

export function formatMonthYear(value: Date | string, locale: Locale) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(toIntlLocale(locale)).format(value)
}

