'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type AdminContextGateProps = {
  children: React.ReactNode
}

export default function AdminContextGate({ children }: AdminContextGateProps) {
  const { user, adminContextRegion, loading } = useAuth()
  const pathname = usePathname()
  const { t } = useLanguage()

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">{t('common.loading')}</div>
  }

  const isSuperAdmin = user?.role === 'super_admin'
  const needsAdminContext = pathname.startsWith('/admin') || pathname.startsWith('/reports')

  if (!needsAdminContext || !isSuperAdmin || adminContextRegion) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t('admin.contextGate.title')}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t('admin.contextGate.body')}
        </p>
        <div className="mt-6">
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <Link href="/super/regions">{t('admin.contextGate.cta')}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
