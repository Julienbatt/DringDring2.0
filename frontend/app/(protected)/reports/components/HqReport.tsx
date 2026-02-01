'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useHqBilling } from '../../hq/hooks/useHqBilling'
import { useHqBillingShops } from '../../hq/hooks/useHqBillingShops'
import { useHqStats } from '../../hq/hooks/useHqStats'
import { API_BASE_URL } from '@/lib/api'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'

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

type HqBillingRow = {
  hq_id?: string | null
  hq_name?: string | null
  admin_region_id?: string | null
  admin_region_name?: string | null
  total_deliveries?: number | null
  total_subvention_due?: number | null
  total_volume_chf?: number | null
  billing_month?: string | null
  is_frozen?: boolean | null
  shop_id?: string | null
  shop_name?: string | null
  city_name?: string | null
}

type RegionOption = {
  id: string
  name: string
}

const DETAIL_COLUMNS = [
  'shop_name',
  'city_name',
  'total_deliveries',
  'total_subvention_due',
  'total_volume_chf',
]
const DETAIL_COLUMNS_WITH_ACTIONS = [...DETAIL_COLUMNS, 'actions']

const DETAIL_COLUMN_LABELS: Record<string, string> = {
  shop_name: 'Commerce',
  city_name: 'Commune partenaire',
  total_deliveries: 'Livraisons',
  total_subvention_due: 'Montant HQ (CHF)',
  total_volume_chf: 'Total CHF',
  actions: 'Action',
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
    const text = await res.text()
    if (res.status === 409 && text.includes('not frozen')) {
      toast.info('Periode non validee pour tous les commerces')
      return
    }
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

function extractFilename(res: Response) {
  const disposition = res.headers.get('content-disposition')
  if (!disposition) return null
  const match = disposition.match(/filename=\"?([^\"]+)\"?/)
  return match ? match[1] : null
}

export default function HqReport() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramMonth = searchParams.get('month')
  const paramRegion = searchParams.get('admin_region_id')
  const [selectedMonth, setSelectedMonth] = useState(
    paramMonth ?? getCurrentMonth()
  )
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(
    paramRegion ?? null
  )
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() =>
    Number(getCurrentMonth().split('-')[0])
  )
  const monthPickerRef = useRef<HTMLDivElement | null>(null)
  const { data: ecoStats } = useEcoStats(selectedMonth)
  const { user } = useAuth()
  const {
    data: hqStats,
  } = useHqStats(selectedMonth)

  const { data, loading, error } = useHqBilling(selectedMonth)
  const { data: shopData, loading: shopLoading, error: shopError } =
    useHqBillingShops(selectedMonth)

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', value)
    if (selectedRegionId) {
      params.set('admin_region_id', selectedRegionId)
    } else {
      params.delete('admin_region_id')
    }
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

  const summaryRows: HqBillingRow[] = Array.isArray(data)
    ? (data as HqBillingRow[])
    : data && typeof data === 'object' && 'rows' in data
      ? ((data as { rows?: HqBillingRow[] }).rows ?? [])
      : []

  const filteredRows: HqBillingRow[] =
    user?.hq_id && Array.isArray(summaryRows)
      ? summaryRows.filter((row) => row.hq_id === user.hq_id)
      : summaryRows

  const regionOptions: RegionOption[] = Array.from(
    new Map(
      filteredRows
        .filter((row) => row.admin_region_id)
        .map((row) => [
          row.admin_region_id,
          {
            id: String(row.admin_region_id),
            name: String(row.admin_region_name ?? row.admin_region_id),
          },
        ])
    ).values()
  )

  const regionAggregates = regionOptions.map((region) => {
    const rows = filteredRows.filter((row) => String(row.admin_region_id) === region.id)
    const deliveries = rows.reduce(
      (sum, row) => sum + Number(row.total_deliveries ?? 0),
      0
    )
    const subvention = rows.reduce(
      (sum, row) => sum + Number(row.total_subvention_due ?? 0),
      0
    )
    const volume = rows.reduce(
      (sum, row) => sum + Number(row.total_volume_chf ?? 0),
      0
    )
    return {
      ...region,
      deliveries,
      subvention,
      volume,
    }
  })

  const resolvedRows: HqBillingRow[] = filteredRows
  const summaryMonth = Array.isArray(data)
    ? selectedMonth
    : data && typeof data === 'object' && 'month' in data
      ? String((data as { month?: string }).month ?? selectedMonth)
      : selectedMonth

  useEffect(() => {
    if (!selectedRegionId && regionOptions.length === 1) {
      setSelectedRegionId(regionOptions[0].id)
    }
  }, [regionOptions, selectedRegionId])

  const isRegionRequired = regionOptions.length > 1
  const canDownloadPdf = !isRegionRequired || Boolean(selectedRegionId)

  const handleRegionChange = (value: string) => {
    const nextValue = value || null
    setSelectedRegionId(nextValue)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', selectedMonth)
    if (nextValue) {
      params.set('admin_region_id', nextValue)
    } else {
      params.delete('admin_region_id')
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  if (loading || shopLoading) {
    return <div className="p-8">Chargement...</div>
  }
  if (error || shopError) {
    return <div className="p-8 text-red-600">{error ?? shopError}</div>
  }
  if (!resolvedRows || resolvedRows.length === 0) {
    return <div className="p-8">Aucune donnee</div>
  }

  const totalDeliveries = resolvedRows.reduce(
    (sum, row) => sum + Number(row.total_deliveries ?? 0),
    0
  )

  const totalSubvention = resolvedRows.reduce(
    (sum, row) => sum + Number(row.total_subvention_due ?? 0),
    0
  )

  const totalVolume = resolvedRows.reduce(
    (sum, row) => sum + Number(row.total_volume_chf ?? 0),
    0
  )
  const totalSubventionValue = totalSubvention
  const totalVolumeValue = totalVolume
  const averageSubventionPerDelivery =
    totalDeliveries > 0
      ? totalSubventionValue / totalDeliveries
      : 0
  const totalBasketValue = hqStats?.total_basket_value_chf ?? 0
  const averageBasketValue = hqStats?.average_basket_value_chf ?? 0
  const cmsDeliveries = hqStats?.cms_deliveries ?? 0
  const cmsSharePct = hqStats?.cms_share_pct ?? 0
  const cmsSubsidy = hqStats?.cms_subsidy_chf ?? 0
  const uniqueClients = hqStats?.unique_clients ?? 0
  const activeShops = hqStats?.active_shops ?? resolvedRows.length
  const activeCities = hqStats?.active_cities ?? 0
  const totalBags = hqStats?.total_bags ?? 0
  const averageBags = hqStats?.average_bags ?? 0
  const activeDays = hqStats?.active_days ?? 0
  const deliveriesPerActiveDay =
    hqStats?.deliveries_per_active_day ??
    (activeDays > 0 ? totalDeliveries / activeDays : 0)
  const deliveriesChangePct = hqStats?.deliveries_change_pct
  const distanceKm = ecoStats?.distance_km ?? 0
  const co2SavedKg = ecoStats?.co2_saved_kg ?? 0

  const hqName = resolvedRows[0]?.hq_name ?? resolvedRows[0]?.hq_id ?? 'Groupe'
  const detailRows = selectedRegionId
    ? (shopData ?? []).filter((row) => String(row.admin_region_id) === selectedRegionId)
    : shopData ?? []
  const topShops = [...detailRows]
    .sort((a, b) => Number(b.total_deliveries ?? 0) - Number(a.total_deliveries ?? 0))
    .slice(0, 3)
  const deliveriesChangeLabel =
    deliveriesChangePct === null || deliveriesChangePct === undefined
      ? 'n/a'
      : `${deliveriesChangePct > 0 ? '+' : ''}${deliveriesChangePct.toFixed(1)}%`
  const deliveriesChangeTone =
    deliveriesChangePct === null || deliveriesChangePct === undefined
      ? 'text-slate-500'
      : deliveriesChangePct >= 0
        ? 'text-emerald-600'
        : 'text-rose-600'

  const handleExport = async () => {
    const params = new URLSearchParams()
    params.set('month', selectedMonth)
    if (selectedRegionId) {
      params.set('admin_region_id', selectedRegionId)
    }
    await downloadCsv(
      `/reports/hq-billing/export?${params.toString()}`,
      'facturation-groupe.csv'
    )
  }

  const handleHqPdf = async () => {
    const safeHq = hqName.replace(/[^a-zA-Z0-9_-]+/g, '_')
    const params = new URLSearchParams()
    params.set('month', selectedMonth)
    params.set('allow_unfrozen', '1')
    if (selectedRegionId) {
      params.set('admin_region_id', selectedRegionId)
    }
    await downloadPdf(
      `/reports/hq-monthly-pdf?${params.toString()}`,
      `DringDring_HQ_${safeHq}_${selectedMonth}.pdf`
    )
  }

  const handlePdf = async (shopId: string, shopName?: string) => {
    const safeName = shopName ? shopName.replace(/[^a-zA-Z0-9_-]+/g, '_') : 'commerce'
    await downloadPdf(
      `/reports/shop-monthly-pdf?shop_id=${encodeURIComponent(
        shopId
      )}&month=${encodeURIComponent(selectedMonth)}`,
      `DringDring_Commerce_${safeName}_${selectedMonth}.pdf`
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8f8f2,_#f7fbf9_40%,_#ffffff_75%)]">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        <header className="relative overflow-hidden rounded-3xl border bg-white/90 shadow-sm">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-100/70 blur-3xl" />
          <div className="absolute -left-24 -bottom-20 h-56 w-56 rounded-full bg-amber-100/60 blur-3xl" />
          <div className="relative space-y-8 p-8 md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  Tableau de bord HQ
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                  Facturation & impact — {hqName}
                </h1>
                <p className="text-sm text-slate-500">
                  Periode : {formatMonth(summaryMonth)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                {regionOptions.length > 1 && (
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <label className="uppercase tracking-widest text-[10px]" htmlFor="hq-region">
                      Region
                    </label>
                    <select
                      id="hq-region"
                      className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      value={selectedRegionId ?? ''}
                      onChange={(event) => handleRegionChange(event.target.value)}
                    >
                      <option value="">Toutes regions</option>
                      {regionOptions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={handleExport}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-emerald-200 hover:text-emerald-700"
                >
                  Exporter CSV
                </button>
                <button
                  onClick={handleHqPdf}
                  disabled={!canDownloadPdf}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  PDF groupe
                </button>
              </div>
            </div>

            <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Impact financier
                </h2>
                <span className="text-xs text-emerald-700">Budget & volume</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-emerald-100 bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">Subvention HQ</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCHF(totalSubventionValue)}</div>
                  <div className="text-xs text-emerald-700/80">Engagement financier du mois</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Volume traite</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCHF(totalVolumeValue)}</div>
                  <div className="text-xs text-slate-500">Valeur totale des commandes</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Livraisons</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{totalDeliveries}</div>
                  <div className="text-xs text-slate-500">Operations completees</div>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-700">Subvention / livraison</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCHF(averageSubventionPerDelivery)}
                  </div>
                  <div className="text-xs text-amber-700/80">Cout moyen par service</div>
                </div>
              </div>
            </section>
          </div>
        </header>

        <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Public & social
            </h2>
            <span className="text-xs text-amber-700">Impact CMS</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-amber-100 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-amber-700">Livraisons CMS</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{cmsDeliveries}</div>
              <div className="text-xs text-amber-700/80">Volume social du mois</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">% de livraisons CMS</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{cmsSharePct.toFixed(1)}%</div>
              <div className="text-xs text-slate-500">Part du total</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Prise en charge CMS</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCHF(cmsSubsidy)}</div>
              <div className="text-xs text-slate-500">Participation Velocite</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              Service & couverture
            </h2>
            <span className="text-xs text-sky-700">Rythme & reach</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Clients servis</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{uniqueClients}</div>
              <div className="text-xs text-slate-500">Menages soutenus</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Commerces actifs</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activeShops}</div>
              <div className="text-xs text-slate-500">Partenaires engages</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Communes couvertes</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activeCities}</div>
              <div className="text-xs text-slate-500">Reseau territorial</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Livraisons / jour</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {deliveriesPerActiveDay.toFixed(1)}
              </div>
              <div className={`text-xs ${deliveriesChangeTone}`}>Evol. {deliveriesChangeLabel}</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Vue par region</h2>
              <p className="text-xs text-slate-500">
                Totaux regionaux — selectionne une region pour filtrer les details et le PDF.
              </p>
            </div>
            {isRegionRequired && !selectedRegionId && (
              <div className="text-xs font-semibold text-amber-600">
                Selectionne une region pour generer le PDF groupe.
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {regionAggregates.map((region) => (
              <button
                key={region.id}
                onClick={() => handleRegionChange(region.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  selectedRegionId === region.id
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : 'border-slate-200 bg-white hover:border-emerald-200'
                }`}
              >
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {region.name}
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {region.deliveries} livraisons
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Subvention: {formatCHF(region.subvention)}
                </div>
                <div className="text-xs text-slate-500">
                  Volume: {formatCHF(region.volume)}
                </div>
              </button>
            ))}
          </div>
          {selectedRegionId && (
            <div className="mt-4">
              <button
                onClick={() => handleRegionChange('')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Revenir a la vue globale
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Top commerces du mois</h2>
                <p className="text-xs text-slate-500">Impact commercial par volume de livraisons</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {topShops.length === 0 ? (
                <div className="text-sm text-slate-500">Aucun commerce actif.</div>
              ) : (
                topShops.map((shop, index) => {
                  const deliveries = Number(shop.total_deliveries ?? 0)
                  const ratio = totalDeliveries > 0 ? (deliveries / totalDeliveries) * 100 : 0
                  return (
                    <div key={shop.shop_id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {index + 1}. {shop.shop_name}
                          </div>
                          <div className="text-xs text-slate-500">{shop.city_name}</div>
                        </div>
                        <div className="text-right text-sm font-semibold text-slate-900">
                          {deliveries} livraisons
                        </div>
                      </div>
                      <div className="mt-3 h-2 w-full rounded-full bg-white">
                        <div
                          className="h-2 rounded-full bg-emerald-400"
                          style={{ width: `${Math.min(100, ratio)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Impact environnemental</h2>
            <p className="text-xs text-slate-500">Mesure d&apos;impact du mois en cours</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">CO2 economise</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {co2SavedKg.toFixed(1)} kg
                </div>
                <div className="text-xs text-emerald-700/80">Par rapport au trajet voiture</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Kilometres a velo</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{distanceKm.toFixed(1)} km</div>
                <div className="text-xs text-slate-500">Estimation aller-retour</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Sacs livres</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{totalBags}</div>
                <div className="text-xs text-slate-500">Moyenne {averageBags.toFixed(1)} sacs</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Panier moyen</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatCHF(averageBasketValue)}
                </div>
                <div className="text-xs text-slate-500">Valeur par livraison</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Detail par commerce</h2>
              <p className="text-xs text-slate-500">Suivi par partenaire pour la periode</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
              >
                Exporter CSV
              </button>
              <button
                onClick={handleHqPdf}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Telecharger PDF
              </button>
            </div>
          </div>

          {regionOptions.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => handleRegionChange('')}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  !selectedRegionId
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 text-slate-600 hover:border-emerald-200'
                }`}
              >
                Tous
              </button>
              {regionOptions.map((region) => (
                <button
                  key={region.id}
                  onClick={() => handleRegionChange(region.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    selectedRegionId === region.id
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-200'
                  }`}
                >
                  {region.name}
                </button>
              ))}
            </div>
          )}

          {detailRows.length === 0 ? (
            <div className="mt-4 text-sm text-slate-500">Aucun detail disponible.</div>
          ) : (
            <div className="mt-5 overflow-auto rounded-2xl border border-slate-100">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {DETAIL_COLUMNS_WITH_ACTIONS.map((col) => (
                      <th
                        key={col}
                        className="border border-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500"
                      >
                        {DETAIL_COLUMN_LABELS[col] ?? col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row, i) => (
                    <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                      {DETAIL_COLUMNS_WITH_ACTIONS.map((col) => {
                        if (col === 'actions') {
                          const shopId = row.shop_id
                          const isAvailable = Boolean(row.is_frozen)
                          return (
                            <td key={col} className="border border-slate-100 px-3 py-2 whitespace-nowrap">
                              <button
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-slate-400"
                                disabled={!shopId || !isAvailable}
                                onClick={() => handlePdf(String(shopId), row.shop_name)}
                                title={isAvailable ? 'Exporter le PDF' : 'Document indisponible'}
                              >
                                Telecharger PDF
                              </button>
                            </td>
                          )
                        }

                        const value = row[col]
                        return (
                          <td key={col} className="border border-slate-100 px-3 py-2 whitespace-nowrap">
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
    </div>
  )
}
