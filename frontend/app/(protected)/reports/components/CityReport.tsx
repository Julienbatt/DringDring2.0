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

function formatCHF(value: number) {
  return `CHF ${value.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatMonth(value: unknown) {
  if (!value) return ''
  const asText = String(value)
  const normalized = asText.length === 7 ? `${asText}-01` : asText
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function getCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

const MONTH_LABELS = [
  'Janvier',
  'Fevrier',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Aout',
  'Septembre',
  'Octobre',
  'Novembre',
  'Decembre',
]

const MONTH_SHORT_LABELS = [
  'Janv',
  'Fevr',
  'Mars',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aout',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
]

const MONEY_COLUMNS = new Set(['total_subvention_due', 'total_volume_chf'])

const DETAIL_COLUMNS = [
  'shop_name',
  'total_deliveries',
  'total_subvention_due',
  'total_volume_chf',
]

const DETAIL_COLUMN_LABELS: Record<string, string> = {
  shop_name: 'Commerce',
  total_deliveries: 'Livraisons',
  total_subvention_due: 'Subvention (CHF)',
  total_volume_chf: 'Total CHF',
}

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramMonth = searchParams.get('month')
  const [selectedMonth, setSelectedMonth] = useState(
    paramMonth ?? getCurrentMonth()
  )
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() =>
    Number(getCurrentMonth().split('-')[0])
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
    const [year] = selectedMonth.split('-')
    setPickerYear(Number(year))
  }, [selectedMonth])

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

  const formatMonthLabel = (year: number, monthIndex: number) => {
    const label = MONTH_LABELS[monthIndex] || ''
    return `${label} ${year}`
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
        Chargement de la facturation mensuelle...
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

  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-sm text-gray-600">
        Aucune donnee de facturation disponible pour cette periode.
      </div>
    )
  }

  const totalDeliveries = data.reduce(
    (sum, row) => sum + Number(row.total_deliveries ?? 0),
    0
  )

  const totalSubvention = data.reduce(
    (sum, row) => sum + Number(row.total_amount_due ?? 0),
    0
  )

  const totalVolume = data.reduce(
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

  const cityName = data[0]?.city_name ?? data[0]?.city_id ?? 'Commune partenaire'
  const cityId = data[0]?.city_id ?? ''
  const detailRows = shopData ?? []

  const handleExport = async () => {
    await downloadCsv(
      `/reports/city-billing/export?month=${encodeURIComponent(selectedMonth)}`,
        'facturation-commune.csv'
    )
  }

  const handlePdfExport = async () => {
    if (!cityId) return
    await downloadPdf(
      `/reports/city-monthly-pdf?city_id=${encodeURIComponent(
        cityId
      )}&month=${encodeURIComponent(selectedMonth)}`,
      `facturation-commune-${selectedMonth}.pdf`
    )
  }

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-3">
        <div>
            <h1 className="text-2xl font-semibold">
              Facturation - Commune partenaire de {cityName}
            </h1>
          <p className="text-sm text-gray-500">
            Periode : {formatMonth(selectedMonth)}
          </p>
        </div>

        <div className="relative" ref={monthPickerRef}>
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 shadow-sm">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="Mois precedent"
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
              aria-label="Mois suivant"
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
                  aria-label="Annee precedente"
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold">{pickerYear}</div>
                <button
                  type="button"
                  onClick={() => setPickerYear((prev) => prev + 1)}
                  aria-label="Annee suivante"
                  className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {MONTH_SHORT_LABELS.map((label, index) => {
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

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-emerald-900 uppercase tracking-wide">
            Impact financier
          </h2>
          <span className="text-xs text-emerald-700">Budget & volume</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">Subvention communale</div>
            <div className="text-2xl font-semibold text-slate-900">
              {formatCHF(totalSubvention)}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">Volume total</div>
            <div className="text-2xl font-semibold text-slate-900">
              {formatCHF(totalVolume)}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">Livraisons</div>
            <div className="text-2xl font-semibold text-slate-900">{totalDeliveries}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide">
            Public & social
          </h2>
          <span className="text-xs text-amber-700">Impact CMS</span>
        </div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : cityStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Livraisons CMS</div>
              <div className="text-2xl font-semibold">{cityStats.cms_deliveries}</div>
              <div className="text-xs text-gray-400">
                {cityStats.cms_share_pct.toFixed(1)}% des livraisons
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">% livraisons CMS</div>
              <div className="text-2xl font-semibold">
                {cityStats.cms_share_pct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">Part du total</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Prise en charge CMS</div>
              <div className="text-2xl font-semibold">
                {formatCHF(cityStats.cms_subsidy_chf ?? 0)}
              </div>
              <div className="text-xs text-gray-400">Participation Velocite</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Beneficiaires CMS</div>
              <div className="text-2xl font-semibold">{cityStats.cms_unique_clients}</div>
              <div className="text-xs text-gray-400">Public prioritaire</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sky-900 uppercase tracking-wide">
            Service & couverture
          </h2>
          <span className="text-xs text-sky-700">Rythme & reach</span>
        </div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : cityStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Beneficiaires uniques</div>
              <div className="text-2xl font-semibold">{cityStats.unique_clients}</div>
              <div className="text-xs text-gray-400">Menages servis</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Commerces actifs</div>
              <div className="text-2xl font-semibold">{cityStats.active_shops}</div>
              <div className="text-xs text-gray-400">Ce mois</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Sacs moyens</div>
              <div className="text-2xl font-semibold">
                {cityStats.average_bags.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400">Total sacs: {cityStats.total_bags}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Jours actifs</div>
              <div className="text-2xl font-semibold">{cityStats.active_days}</div>
              <div className="text-xs text-gray-400">Mois en cours</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Livraisons / jour</div>
              <div className="text-2xl font-semibold">
                {cityStats.deliveries_per_active_day.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400">Jours actifs</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Efficience
          </h2>
          <span className="text-xs text-slate-500">Cout moyen</span>
        </div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Subvention / livraison</div>
              <div className="text-2xl font-semibold">
                {formatCHF(averageSubventionPerDelivery)}
              </div>
              <div className="text-xs text-gray-400">Moyenne du mois</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Subvention / beneficiaire</div>
              <div className="text-2xl font-semibold">
                {formatCHF(averageSubventionPerBeneficiary)}
              </div>
              <div className="text-xs text-gray-400">Par menage servi</div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-teal-900 uppercase tracking-wide">
            Impact environnemental
          </h2>
          <span className="text-xs text-teal-700">Mobilite douce</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">Km a velo (mois)</div>
            <div className="text-2xl font-semibold">
              {ecoLoading || !ecoStats ? '-' : ecoStats.distance_km.toFixed(1)}
            </div>
            <div className="text-xs text-gray-400">Estimation aller-retour</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">CO2 economise (kg)</div>
            <div className="text-2xl font-semibold">
              {ecoLoading || !ecoStats ? '-' : ecoStats.co2_saved_kg.toFixed(1)}
            </div>
            <div className="text-xs text-gray-400">Base voiture 93.6 g/km</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            Detail par commerce
          </h2>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="text-sm text-blue-600 hover:underline"
            >
              Exporter CSV
            </button>
            <button
              onClick={handlePdfExport}
              className="text-sm text-blue-600 hover:underline"
            >
              Telecharger PDF
            </button>
          </div>
        </div>

        {detailRows.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun detail disponible.</div>
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
                      {DETAIL_COLUMN_LABELS[col] ?? col}
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
                            ? formatCHF(value)
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
