'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function LegacyDringDringBridge() {
  const { t } = useLanguage()
  useEffect(() => {
    const url = new URL(window.location.href)
    const search = url.search || ''
    const hash = window.location.hash || ''

    // Forward legacy links to the auth callback while preserving tokens.
    if (search.includes('code=') || search.includes('token_hash=') || hash.includes('access_token=')) {
      window.location.replace(`/auth/callback${search}${hash}`)
      return
    }

    // Legacy path without auth payload: go to login.
    window.location.replace('/login')
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="rounded-lg border bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        {t('common.redirecting')}
      </div>
    </div>
  )
}
