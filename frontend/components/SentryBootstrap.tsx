'use client'

import { useEffect } from 'react'

import { initSentryBrowser } from '@/lib/monitoring/sentry'

export default function SentryBootstrap() {
  useEffect(() => {
    initSentryBrowser()
  }, [])

  return null
}
