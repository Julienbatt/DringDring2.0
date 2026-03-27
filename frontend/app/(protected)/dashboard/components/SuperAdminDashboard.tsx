'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, MapPin, Users } from 'lucide-react'

import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import BrandLogo from '@/components/BrandLogo'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'


type AdminRegion = {
  id: string
  name: string
  active?: boolean
  address?: string | null
  contact_email?: string | null
  contact_person?: string | null
  phone?: string | null
  canton_name?: string | null
}

export default function SuperAdminDashboard() {
  const { t } = useLanguage()
  const { session, setAdminContext } = useAuth()
  const router = useRouter()
  const [regions, setRegions] = useState<AdminRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const loadRegions = async () => {
      if (!session?.access_token) return
      try {
        const data = await apiGet<AdminRegion[]>('/regions', session.access_token)
        setRegions(data)
      } catch (error) {
        captureError(error, 'SuperAdminDashboard.loadRegions')
      } finally {
        setLoading(false)
      }
    }

    loadRegions()
  }, [session?.access_token, t])

  const filteredRegions = regions.filter((region) =>
    region.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleEnterRegion = (region: AdminRegion) => {
    setAdminContext({ id: region.id, name: region.name })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex w-full flex-col gap-6 px-4 pb-16 pt-6 md:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-6 p-6 md:max-w-3xl md:p-10">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <BrandLogo width={180} height={54} className="h-10 w-auto md:h-12" alt={t('common.brandName')} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">{t('super.dashboard.overline')}</p>
                <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">{t('super.dashboard.title')}</h1>
              </div>
            </div>
            <p className="text-sm text-slate-600 md:text-base">
              {t('super.dashboard.subtitle')}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t('super.dashboard.regionsTitle')}</h2>
              <p className="text-sm text-slate-600">
                {t('super.dashboard.regionsSubtitle')}
              </p>
            </div>
            <Link href="/super/regions" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
              {t('super.dashboard.manageRegions')}
            </Link>
          </div>

          <div className="mt-4 max-w-md">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('super.dashboard.searchPlaceholder')}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {loading ? (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                {t('super.dashboard.loading')}
              </div>
            ) : filteredRegions.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                {t('super.dashboard.empty')}
              </div>
            ) : (
              filteredRegions.map((region) => (
                <div key={region.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <MapPin className="h-4 w-4" />
                          {region.canton_name || t('super.dashboard.cantonUndefined')}
                        </div>
                      <h3 className="text-lg font-semibold text-slate-900">{region.name}</h3>
                      {region.contact_email && (
                        <p className="text-xs text-slate-500">{region.contact_email}</p>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs ${region.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {region.active ? t('super.dashboard.active') : t('super.dashboard.inactive')}
                    </span>
                  </div>
                  <Button
                    className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleEnterRegion(region)}
                  >
                    {t('super.dashboard.enterRegion')}
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/super/regions"
            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200"
          >
            <Building2 className="h-6 w-6 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">{t('super.dashboard.cardRegionsTitle')}</h3>
              <p className="text-sm text-slate-600">{t('super.dashboard.cardRegionsDesc')}</p>
            </div>
          </Link>
          <Link
            href="/super/users"
            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200"
          >
            <Users className="h-6 w-6 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">{t('super.dashboard.cardUsersTitle')}</h3>
              <p className="text-sm text-slate-600">{t('super.dashboard.cardUsersDesc')}</p>
            </div>
          </Link>
        </section>
      </div>
    </div>
  )
}
