'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function normalizeNextPath(nextValue: string | null): string {
  if (!nextValue) return '/dashboard'
  return nextValue.startsWith('/') ? nextValue : '/dashboard'
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => {
    let mounted = true

    async function run() {
      try {
        const url = new URL(window.location.href)
        const hash = window.location.hash.replace(/^#/, '')
        const hashParams = new URLSearchParams(hash)
        const searchParams = url.searchParams

        const nextPath = normalizeNextPath(searchParams.get('next'))
        const flowType = (
          searchParams.get('type') ||
          hashParams.get('type') ||
          ''
        ).toLowerCase()

        let authError: string | null = null

        const code = searchParams.get('code')
        const tokenHash = searchParams.get('token_hash')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) authError = error.message
        } else if (tokenHash) {
          const otpType = (searchParams.get('type') || 'invite') as
            | 'invite'
            | 'recovery'
            | 'signup'
            | 'magiclink'
            | 'email_change'
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          })
          if (error) authError = error.message
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) authError = error.message
        } else {
          authError = 'Missing auth token'
        }

        if (!mounted) return

        if (authError) {
          router.replace('/login?error=auth_callback')
          return
        }

        if (flowType === 'invite' || flowType === 'recovery' || tokenHash) {
          router.replace('/set-password')
          return
        }

        router.replace(nextPath)
      } catch {
        if (!mounted) return
        router.replace('/login?error=auth_callback')
      }
    }

    void run()

    return () => {
      mounted = false
    }
  }, [router, supabase])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="rounded-lg border bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        {t('auth.callback.validating')}
      </div>
    </div>
  )
}
