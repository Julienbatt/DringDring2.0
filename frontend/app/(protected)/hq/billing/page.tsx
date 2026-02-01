'use client'

import { Suspense } from 'react'
import HqReport from '../../reports/components/HqReport'

function HqBillingContent() {
  return <HqReport />
}

export default function HqBillingPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <HqBillingContent />
    </Suspense>
  )
}
