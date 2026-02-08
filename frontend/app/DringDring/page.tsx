'use client'

import { useEffect } from 'react'

export default function LegacyDringDringBridge() {
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
        Redirection en cours...
      </div>
    </div>
  )
}
