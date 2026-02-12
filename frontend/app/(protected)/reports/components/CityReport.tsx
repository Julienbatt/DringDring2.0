'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCityBilling } from '../../dashboard/hooks/useCityBilling'
import { useCityBillingShops } from '../../dashboard/hooks/useCityBillingShops'
import { API_BASE_URL } from '@/lib/api'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { useCityStats } from '../../dashboard/hooks/useCityStats'
import { useAuth } from '../../providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function formatCHF(value: number, localeTag: string) {
  return `CHF ${value.toLocaleString(localeTag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatMonth(value: unknown, localeTag: string) {
  if (!value) return ''
  const asText = String(value)
  const normalized = asText.length === 7 ? `${asText}-01` : asText
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' })
}

function getCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

const MONEY_COLUMNS = new Set(['total_subvention_due', 'total_volume_chf'])

const DETAIL_COLUMNS = [
  'shop_name',
  'total_deliveries',
  'total_subvention_due',
  'total_volume_chf',
]

async function downloadCsv(path: string, filename: string) {
  const supabase = createClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) return

  const apiUrl = API_BASE_URL

  const res = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', extractFilename(res) ?? filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function downloadPdf(path: string, filename: string) {
  const supabase = createClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) return

  const apiUrl = API_BASE_URL

  const res = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    throw new Error(`PDF failed: ${res.status}`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', extractFilename(res) ?? filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function extractFilename(res: Response) {
  const disposition = res.headers.get('content-disposition')
  if (!disposition) return null
  const match = disposition.match(/filename=\"?([^\"]+)\"?/)
  return match ? match[1] : null
}

export default function CityReport() {
  const { locale, t } = useLanguage()
  const localeTag =
    locale === 'de'
      ? 'de-CH'
      : locale === 'it'
        ? 'it-CH'
        : locale === 'en'
          ? 'en-CH'
          : 'fr-CH'
    const tx = {
    title: t('city.report.title'),
    period: t('city.report.period'),
    loading: t('city.report.loading'),
    noDataTitle: t('city.report.noDataTitle'),
    noDataBody: t('city.report.noDataBody'),
    previousMonth: t('city.report.previousMonth'),
    openBilling: t('city.report.openBilling'),
    budgetVolume: t('city.report.budgetVolume'),
    financialImpact: t('city.report.financialImpact'),
    municipalSubsidy: t('city.report.municipalSubsidy'),
    totalVolume: t('city.report.totalVolume'),
    deliveries: t('city.report.deliveries'),
    socialImpact: t('city.report.socialImpact'),
    cmsImpact: t('city.report.cmsImpact'),
    loadingShort: t('city.report.loadingShort'),
    cmsDeliveries: t('city.report.cmsDeliveries'),
    cmsDeliveriesHint: t('city.report.cmsDeliveriesHint'),
    cmsShare: t('city.report.cmsShare'),
    cmsShareHint: t('city.report.cmsShareHint'),
    cmsCoverage: t('city.report.cmsCoverage'),
    priorityAudience: t('city.report.priorityAudience'),
    priorityAudienceHint: t('city.report.priorityAudienceHint'),
    serviceCoverage: t('city.report.serviceCoverage'),
    paceReach: t('city.report.paceReach'),
    uniqueBeneficiaries: t('city.report.uniqueBeneficiaries'),
    households: t('city.report.households'),
    activeShops: t('city.report.activeShops'),
    avgBags: t('city.report.avgBags'),
    activeDays: t('city.report.activeDays'),
    perDay: t('city.report.perDay'),
    efficiency: t('city.report.efficiency'),
    averageCost: t('city.report.averageCost'),
    subsidyPerDelivery: t('city.report.subsidyPerDelivery'),
    subsidyPerBeneficiary: t('city.report.subsidyPerBeneficiary'),
    monthlyAverage: t('city.report.monthlyAverage'),
    envImpact: t('city.report.envImpact'),
    softMobility: t('city.report.softMobility'),
    bikeKm: t('city.report.bikeKm'),
    co2Saved: t('city.report.co2Saved'),
    detailByShop: t('city.report.detailByShop'),
    exportCsv: t('city.report.exportCsv'),
    downloadPdf: t('city.report.downloadPdf'),
    noDetail: t('city.report.noDetail'),
    monthPrevAria: t('city.report.monthPrevAria'),
    monthNextAria: t('city.report.monthNextAria'),
    yearPrevAria: t('city.report.yearPrevAria'),
    yearNextAria: t('city.report.yearNextAria'),
    partnerCity: t('city.report.partnerCity'),
    participationVelocite: t('city.report.participationVelocite'),
    thisMonth: t('city.report.thisMonth'),
    monthInProgress: t('city.report.monthInProgress'),
    activeDaysHint: t('city.report.activeDaysHint'),
    totalBags: t('city.report.totalBags'),
    estimateRoundTrip: t('city.report.estimateRoundTrip'),
    carBase: t('city.report.carBase'),
  } as const
    const detailColumnLabels: Record<string, string> = {
    shop_name: t('city.report.table.shop_name'),
    total_deliveries: tx.deliveries,
    total_subvention_due: t('city.report.table.total_subvention_due'),
    total_volume_chf: t('city.report.table.total_volume_chf'),
  }

  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramMonth = searchParams.get('month')
  const [selectedMonth, setSelectedMonth] = useState(
    paramMonth ?? getCurrentMonth()
  )
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(
    Number(selectedMonth.split('-')[0] ?? getCurrentMonth().split('-')[0])
  )
  const monthPickerRef = useRef<HTMLDivElement | null>(null)

  const { data, loading, error } = useCityBilling(selectedMonth)
  const {
    data: shopData,
    loading: shopLoading,
    error: shopError,
  } = useCityBillingShops(selectedMonth)
  const { data: ecoStats, loading: ecoLoading } = useEcoStats(selectedMonth)
  const {
    data: cityStats,
    loading: statsLoading,
    error: statsError,
  } = useCityStats(selectedMonth)

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', value)
    router.replace(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    if (!monthPickerOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!monthPickerRef.current) return
      if (!monthPickerRef.current.contains(event.target as Node)) {
        setMonthPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [monthPickerOpen])

  const [selectedYear, selectedMonthIndex] = selectedMonth
    .split('-')
    .map((value, index) => (index === 0 ? Number(value) : Number(value) - 1)) as [
    number,
    number,
  ]

  useEffect(() => {
    setPickerYear(selectedYear)
  }, [selectedYear])

  const formatMonthLabel = (year: number, monthIndex: number) => {
    const date = new Date(year, monthIndex, 1)
    return date.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' })
  }

  const getMonthValue = (year: number, monthIndex: number) => {
    const monthValue = String(monthIndex + 1).padStart(2, '0')
    return `${year}-${monthValue}`
  }

  const stepMonth = (delta: number) => {
    const date = new Date(selectedYear, selectedMonthIndex + delta, 1)
    handleMonthChange(getMonthValue(date.getFullYear(), date.getMonth()))
  }

  if (loading || shopLoading) {
    return (
      <div className="p-8 text-sm text-gray-600">
        {tx.loading}
      </div>
    )
  }

  if (error || shopError) {
    return (
      <div className="p-8 text-sm text-red-600">
        {error ?? shopError}
      </div>
    )
  }

  const rows = data ?? []
  const hasData = rows.length > 0

  const totalDeliveries = rows.reduce(
    (sum, row) => sum + Number(row.total_deliveries ?? 0),
    0
  )

  const totalSubvention = rows.reduce(
    (sum, row) => sum + Number(row.total_amount_due ?? 0),
    0
  )

  const totalVolume = rows.reduce(
    (sum, row) => sum + Number(row.total_volume_chf ?? 0),
    0
  )

  const subventionBase =
    cityStats?.total_subvention_chf ?? totalSubvention
  const averageSubventionPerDelivery =
    totalDeliveries > 0 ? subventionBase / totalDeliveries : 0
  const averageSubventionPerBeneficiary =
    cityStats && cityStats.unique_clients > 0
      ? subventionBase / cityStats.unique_clients
      : 0

  const cityName = String(
    rows[0]?.city_name ?? rows[0]?.city_id ?? user?.city_id ?? tx.partnerCity
  )
  const cityId = String(rows[0]?.city_id ?? user?.city_id ?? '')
  const detailRows = shopData ?? []

  const handleExport = async () => {
    await downloadCsv(
      `/reports/city-billing/export?month=${encodeURIComponent(selectedMonth)}`,
      t('city.report.exportFilename')
    )
  }

  const handlePdfExport = async () => {
    if (!cityId) return
    await downloadPdf(
      `/reports/city-monthly-pdf?city_id=${encodeURIComponent(
        cityId
      )}&month=${encodeURIComponent(selectedMonth)}`,
      `${t('city.report.pdfFilenamePrefix')}-${selectedMonth}.pdf`
    )
  }

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-3">
        <div>
            <h1 className="text-2xl font-semibold">
            {tx.title} {cityName}
            </h1>
          <p className="text-sm text-gray-500">
            {tx.period} : {formatMonth(selectedMonth, localeTag)}
          </p>
        </div>

        <div className="relative" ref={monthPickerRef}>
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 shadow-sm">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label={tx.monthPrevAria}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              onClick={() => setMonthPickerOpen((prev) => !prev)}
            >
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>{formatMonthLabel(selectedYear, selectedMonthIndex)}</span>
            </button>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label={tx.monthNextAria}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {monthPickerOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-[260px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPickerYear((prev) => prev - 1)}
                  aria-label={tx.yearPrevAria}
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold">{pickerYear}</div>
                <button
                  type="button"
                  onClick={() => setPickerYear((prev) => prev + 1)}
                  aria-label={tx.yearNextAria}
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }).map((_, index) => {
                  const label = new Date(pickerYear, index, 1).toLocaleDateString(localeTag, { month: 'short' })
                  const isSelected =
                    pickerYear === selectedYear && index === selectedMonthIndex
                  return (
                    <button
                      key={`${pickerYear}-${index}`}
                      type="button"
                      className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                        isSelected
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                      onClick={() => {
                        handleMonthChange(getMonthValue(pickerYear, index))
                        setMonthPickerOpen(false)
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {!hasData ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {tx.noDataTitle} {formatMonth(selectedMonth, localeTag)}
          </h2>
          <p className="text-sm text-slate-600">
            {tx.noDataBody}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => stepMonth(-1)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
            >
              {tx.previousMonth}
            </button>
            <button
              onClick={() => router.push('/city/billing')}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {tx.openBilling}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-emerald-900 uppercase tracking-wide">
            {tx.financialImpact}
          </h2>
          <span className="text-xs text-emerald-700">{tx.budgetVolume}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{tx.municipalSubsidy}</div>
            <div className="text-2xl font-semibold text-slate-900">
              {formatCHF(totalSubvention, localeTag)}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{tx.totalVolume}</div>
            <div className="text-2xl font-semibold text-slate-900">
              {formatCHF(totalVolume, localeTag)}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{tx.deliveries}</div>
            <div className="text-2xl font-semibold text-slate-900">{totalDeliveries}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide">
            {tx.socialImpact}
          </h2>
          <span className="text-xs text-amber-700">{tx.cmsImpact}</span>
        </div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">{tx.loadingShort}</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : cityStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.cmsDeliveries}</div>
              <div className="text-2xl font-semibold">{cityStats.cms_deliveries}</div>
              <div className="text-xs text-gray-400">
                {tx.cmsDeliveriesHint.replace('{pct}', cityStats.cms_share_pct.toFixed(1))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.cmsShare}</div>
              <div className="text-2xl font-semibold">
                {cityStats.cms_share_pct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">{tx.cmsShareHint}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.cmsCoverage}</div>
              <div className="text-2xl font-semibold">
                {formatCHF(cityStats.cms_subsidy_chf ?? 0, localeTag)}
              </div>
              <div className="text-xs text-gray-400">{tx.participationVelocite}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.priorityAudience}</div>
              <div className="text-2xl font-semibold">{cityStats.cms_unique_clients}</div>
              <div className="text-xs text-gray-400">{tx.priorityAudienceHint}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sky-900 uppercase tracking-wide">
            {tx.serviceCoverage}
          </h2>
          <span className="text-xs text-sky-700">{tx.paceReach}</span>
        </div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">{tx.loadingShort}</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : cityStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.uniqueBeneficiaries}</div>
              <div className="text-2xl font-semibold">{cityStats.unique_clients}</div>
              <div className="text-xs text-gray-400">{tx.households}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.activeShops}</div>
              <div className="text-2xl font-semibold">{cityStats.active_shops}</div>
              <div className="text-xs text-gray-400">{tx.thisMonth}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.avgBags}</div>
              <div className="text-2xl font-semibold">
                {cityStats.average_bags.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400">{tx.totalBags}: {cityStats.total_bags}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.activeDays}</div>
              <div className="text-2xl font-semibold">{cityStats.active_days}</div>
              <div className="text-xs text-gray-400">{tx.monthInProgress}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.perDay}</div>
              <div className="text-2xl font-semibold">
                {cityStats.deliveries_per_active_day.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400">{tx.activeDaysHint}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            {tx.efficiency}
          </h2>
          <span className="text-xs text-slate-500">{tx.averageCost}</span>
        </div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">{tx.loadingShort}</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.subsidyPerDelivery}</div>
              <div className="text-2xl font-semibold">
                {formatCHF(averageSubventionPerDelivery, localeTag)}
              </div>
              <div className="text-xs text-gray-400">{tx.monthlyAverage}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.subsidyPerBeneficiary}</div>
              <div className="text-2xl font-semibold">
                {formatCHF(averageSubventionPerBeneficiary, localeTag)}
              </div>
              <div className="text-xs text-gray-400">{tx.households}</div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-teal-900 uppercase tracking-wide">
            {tx.envImpact}
          </h2>
          <span className="text-xs text-teal-700">{tx.softMobility}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{tx.bikeKm}</div>
            <div className="text-2xl font-semibold">
              {ecoLoading || !ecoStats ? '-' : ecoStats.distance_km.toFixed(1)}
            </div>
            <div className="text-xs text-gray-400">{tx.estimateRoundTrip}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{tx.co2Saved}</div>
            <div className="text-2xl font-semibold">
              {ecoLoading || !ecoStats ? '-' : ecoStats.co2_saved_kg.toFixed(1)}
            </div>
            <div className="text-xs text-gray-400">{tx.carBase}</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            {tx.detailByShop}
          </h2>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="text-sm text-blue-600 hover:underline"
            >
              {tx.exportCsv}
            </button>
            <button
              onClick={handlePdfExport}
              className="text-sm text-blue-600 hover:underline"
            >
              {tx.downloadPdf}
            </button>
          </div>
        </div>

        {detailRows.length === 0 ? (
          <div className="text-sm text-gray-500">{tx.noDetail}</div>
        ) : (
          <div className="overflow-auto border rounded">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {DETAIL_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="border px-3 py-2 text-left font-medium text-gray-700"
                    >
                      {detailColumnLabels[col] ?? col}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {detailRows.map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    {DETAIL_COLUMNS.map((col) => {
                      const value = row[col]

                      return (
                        <td
                          key={col}
                          className="border px-3 py-2 whitespace-nowrap"
                        >
                          {typeof value === 'number' && MONEY_COLUMNS.has(col)
                            ? formatCHF(value, localeTag)
                            : String(value ?? '')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
