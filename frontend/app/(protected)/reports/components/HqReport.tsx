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
      toast.info('Billing period not frozen for all shops')
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
  const { locale } = useLanguage()
  const localeTag =
    locale === 'de'
      ? 'de-CH'
      : locale === 'it'
        ? 'it-CH'
        : locale === 'en'
          ? 'en-CH'
          : 'fr-CH'
  const tx = {
    loading: locale === 'de' ? 'Wird geladen...' : locale === 'it' ? 'Caricamento...' : locale === 'en' ? 'Loading...' : 'Chargement...',
    group: locale === 'de' ? 'Gruppe' : locale === 'it' ? 'Gruppo' : locale === 'en' ? 'Group' : 'Groupe',
    dashboardTag: locale === 'de' ? 'HQ Dashboard' : locale === 'it' ? 'Dashboard HQ' : locale === 'en' ? 'HQ dashboard' : 'Tableau de bord HQ',
    title: locale === 'de' ? 'Abrechnung und Impact' : locale === 'it' ? 'Fatturazione e impatto' : locale === 'en' ? 'Billing & impact' : 'Facturation & impact',
    period: locale === 'de' ? 'Zeitraum' : locale === 'it' ? 'Periodo' : locale === 'en' ? 'Period' : 'Periode',
    region: locale === 'de' ? 'Region' : locale === 'it' ? 'Regione' : locale === 'en' ? 'Region' : 'Region',
    allRegions: locale === 'de' ? 'Alle Regionen' : locale === 'it' ? 'Tutte le regioni' : locale === 'en' ? 'All regions' : 'Toutes regions',
    exportCsv: locale === 'de' ? 'CSV exportieren' : locale === 'it' ? 'Esporta CSV' : locale === 'en' ? 'Export CSV' : 'Exporter CSV',
    groupPdf: locale === 'de' ? 'Gruppen-PDF' : locale === 'it' ? 'PDF gruppo' : locale === 'en' ? 'Group PDF' : 'PDF groupe',
    copySummary: locale === 'de' ? 'Zusammenfassung kopieren' : locale === 'it' ? 'Copia riepilogo' : locale === 'en' ? 'Copy summary' : 'Copier resume',
    summaryCopied: locale === 'de' ? 'Zusammenfassung kopiert' : locale === 'it' ? 'Riepilogo copiato' : locale === 'en' ? 'Summary copied' : 'Resume copie',
    summaryCopyError: locale === 'de' ? 'Kopieren unmoglich' : locale === 'it' ? 'Copia non disponibile' : locale === 'en' ? 'Copy failed' : 'Copie impossible',
    noDataTitle: locale === 'de' ? 'Keine konsolidierten Daten diesen Monat' : locale === 'it' ? 'Nessun dato consolidato questo mese' : locale === 'en' ? 'No consolidated data this month' : 'Aucune donnee consolidee ce mois',
    noDataBody: locale === 'de' ? 'Volumen erscheinen sobald Lieferungen konsolidiert werden.' : locale === 'it' ? 'I volumi appariranno appena le consegne saranno consolidate.' : locale === 'en' ? 'Volumes will appear once deliveries are consolidated.' : 'Les volumes apparaitront des que des livraisons seront consolidees.',
    previousMonth: locale === 'de' ? 'Vorherigen Monat anzeigen' : locale === 'it' ? 'Vedi mese precedente' : locale === 'en' ? 'View previous month' : 'Voir le mois precedent',
    viewShops: locale === 'de' ? 'Geschafte anzeigen' : locale === 'it' ? 'Vedi negozi' : locale === 'en' ? 'View shops' : 'Voir les commerces',
    deliveries: locale === 'de' ? 'Lieferungen' : locale === 'it' ? 'Consegne' : locale === 'en' ? 'Deliveries' : 'Livraisons',
    detailByShop: locale === 'de' ? 'Details nach Geschaft' : locale === 'it' ? 'Dettaglio per negozio' : locale === 'en' ? 'Detail by shop' : 'Detail par commerce',
    noDetail: locale === 'de' ? 'Keine Details verfugbar.' : locale === 'it' ? 'Nessun dettaglio disponibile.' : locale === 'en' ? 'No details available.' : 'Aucun detail disponible.',
    downloadPdf: locale === 'de' ? 'PDF herunterladen' : locale === 'it' ? 'Scarica PDF' : locale === 'en' ? 'Download PDF' : 'Telecharger PDF',
    all: locale === 'de' ? 'Alle' : locale === 'it' ? 'Tutti' : locale === 'en' ? 'All' : 'Tous',
    monthPrevAria: locale === 'de' ? 'Vorheriger Monat' : locale === 'it' ? 'Mese precedente' : locale === 'en' ? 'Previous month' : 'Mois precedent',
    monthNextAria: locale === 'de' ? 'Nachster Monat' : locale === 'it' ? 'Mese successivo' : locale === 'en' ? 'Next month' : 'Mois suivant',
    yearPrevAria: locale === 'de' ? 'Vorheriges Jahr' : locale === 'it' ? 'Anno precedente' : locale === 'en' ? 'Previous year' : 'Annee precedente',
    yearNextAria: locale === 'de' ? 'Nachstes Jahr' : locale === 'it' ? 'Anno successivo' : locale === 'en' ? 'Next year' : 'Annee suivante',
  } as const

  const detailColumnLabels: Record<string, string> = {
    shop_name: locale === 'de' ? 'Geschaft' : locale === 'it' ? 'Negozio' : locale === 'en' ? 'Shop' : 'Commerce',
    city_name: locale === 'de' ? 'Partnergemeinde' : locale === 'it' ? 'Comune partner' : locale === 'en' ? 'Partner city' : 'Commune partenaire',
    total_deliveries: tx.deliveries,
    total_subvention_due: locale === 'de' ? 'HQ-Betrag (CHF)' : locale === 'it' ? 'Importo HQ (CHF)' : locale === 'en' ? 'HQ amount (CHF)' : 'Montant HQ (CHF)',
    total_volume_chf: locale === 'de' ? 'Total CHF' : locale === 'it' ? 'Totale CHF' : locale === 'en' ? 'Total CHF' : 'Total CHF',
    actions: locale === 'de' ? 'Aktion' : locale === 'it' ? 'Azione' : locale === 'en' ? 'Action' : 'Action',
  }
  const monthLabels = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(localeTag, { month: 'long' }).format(new Date(2024, index, 1))
  )
  const monthShortLabels = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(localeTag, { month: 'short' })
      .format(new Date(2024, index, 1))
      .replace('.', '')
  )

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
  const [pickerYear, setPickerYear] = useState(
    Number(selectedMonth.split('-')[0] ?? getCurrentMonth().split('-')[0])
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
    const label = monthLabels[monthIndex] || ''
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

  const effectiveSelectedRegionId =
    selectedRegionId ?? (regionOptions.length === 1 ? regionOptions[0].id : null)

  const isRegionRequired = regionOptions.length > 1
  const canDownloadPdf = !isRegionRequired || Boolean(effectiveSelectedRegionId)

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
    return <div className="p-8">{tx.loading}</div>
  }
  if (error || shopError) {
    return <div className="p-8 text-red-600">{error ?? shopError}</div>
  }
  const hasData = Boolean(resolvedRows && resolvedRows.length > 0)

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

  const hqName = resolvedRows[0]?.hq_name ?? resolvedRows[0]?.hq_id ?? tx.group
  const detailRows = effectiveSelectedRegionId
    ? (shopData ?? []).filter((row) => String(row.admin_region_id) === effectiveSelectedRegionId)
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
  const hqSummaryText = [
    `DringDring - ${tx.title} (${formatMonth(summaryMonth, localeTag)})`,
    `${tx.group}: ${hqName}`,
    `${tx.subventionHq}: ${formatCHF(totalSubventionValue, localeTag)}`,
    `${tx.processedVolume}: ${formatCHF(totalVolumeValue, localeTag)}`,
    `${tx.deliveries}: ${totalDeliveries}`,
    `${tx.subsidyPerDelivery}: ${formatCHF(averageSubventionPerDelivery, localeTag)}`,
    `CMS: ${cmsSharePct.toFixed(1)}% (${cmsDeliveries} ${tx.deliveriesSuffix})`,
    `${locale === 'de' ? 'Betreute Kunden' : locale === 'it' ? 'Clienti serviti' : locale === 'en' ? 'Served customers' : 'Clients servis'}: ${uniqueClients} | ${locale === 'de' ? 'Aktive Geschafte' : locale === 'it' ? 'Negozi attivi' : locale === 'en' ? 'Active shops' : 'Commerces actifs'}: ${activeShops} | ${locale === 'de' ? 'Abgedeckte Gemeinden' : locale === 'it' ? 'Comuni coperti' : locale === 'en' ? 'Covered cities' : 'Communes couvertes'}: ${activeCities}`,
    `${tx.envImpact}: ${co2SavedKg.toFixed(1)} kg CO2, ${distanceKm.toFixed(1)} km`,
  ].join('\n')

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(hqSummaryText)
      toast.success(tx.summaryCopied)
    } catch {
      toast.error(tx.summaryCopyError)
    }
  }

  const handleExport = async () => {
    const params = new URLSearchParams()
    params.set('month', selectedMonth)
    if (effectiveSelectedRegionId) {
      params.set('admin_region_id', effectiveSelectedRegionId)
    }
    await downloadCsv(
      `/reports/hq-billing/export?${params.toString()}`,
      locale === 'de'
        ? 'abrechnung-gruppe.csv'
        : locale === 'it'
          ? 'fatturazione-gruppo.csv'
          : locale === 'en'
            ? 'group-billing.csv'
            : 'facturation-groupe.csv'
    )
  }

  const handleHqPdf = async () => {
    const safeHq = hqName.replace(/[^a-zA-Z0-9_-]+/g, '_')
    const params = new URLSearchParams()
    params.set('month', selectedMonth)
    params.set('allow_unfrozen', '1')
    if (effectiveSelectedRegionId) {
      params.set('admin_region_id', effectiveSelectedRegionId)
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
      <div className="w-full px-6 py-10 space-y-10">
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
                  {tx.title} — {hqName}
                </h1>
                <p className="text-sm text-slate-500">
                  {tx.period} : {formatMonth(summaryMonth, localeTag)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                        {monthShortLabels.map((label, index) => {
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
                      {tx.region}
                    </label>
                    <select
                      id="hq-region"
                      className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      value={effectiveSelectedRegionId ?? ''}
                      onChange={(event) => handleRegionChange(event.target.value)}
                    >
                      <option value="">{tx.allRegions}</option>
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
                  {tx.exportCsv}
                </button>
                <button
                  onClick={handleHqPdf}
                  disabled={!canDownloadPdf}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  PDF groupe
                </button>
                <button
                  onClick={handleCopySummary}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                >
                  {tx.copySummary}
                </button>
              </div>
            </div>

            <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  {tx.impactFinancial}
                </h2>
                <span className="text-xs text-emerald-700">Budget & volume</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-emerald-100 bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">{tx.subventionHq}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCHF(totalSubventionValue, localeTag)}</div>
                  <div className="text-xs text-emerald-700/80">Engagement financier du mois</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{tx.processedVolume}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCHF(totalVolumeValue, localeTag)}</div>
                  <div className="text-xs text-slate-500">Valeur totale des commandes</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{tx.deliveries}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{totalDeliveries}</div>
                  <div className="text-xs text-slate-500">Operations completees</div>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-700">Subvention / livraison</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCHF(averageSubventionPerDelivery, localeTag)}
                  </div>
                  <div className="text-xs text-amber-700/80">Cout moyen par service</div>
                </div>
              </div>
            </section>
          </div>
        </header>

        {!hasData ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
            <h2 className="text-lg font-semibold text-slate-900">{tx.noDataTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Le dashboard reste disponible pour le pilotage. Les volumes apparaitront des que des
              livraisons seront consolidees sur {formatMonth(selectedMonth, localeTag)}.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
              >
                Voir le mois precedent
              </button>
              <button
                type="button"
                onClick={() => router.push('/hq/shops')}
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                {tx.viewShops}
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Public & social
            </h2>
            <span className="text-xs text-amber-700">{tx.cmsImpact}</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-amber-100 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-amber-700">{tx.cmsDeliveries}</div>
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
              <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCHF(cmsSubsidy, localeTag)}</div>
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
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {locale === 'de' ? 'Aktive Geschafte' : locale === 'it' ? 'Negozi attivi' : locale === 'en' ? 'Active shops' : 'Commerces actifs'}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activeShops}</div>
              <div className="text-xs text-slate-500">Partenaires engages</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {locale === 'de' ? 'Abgedeckte Gemeinden' : locale === 'it' ? 'Comuni coperti' : locale === 'en' ? 'Covered cities' : 'Communes couvertes'}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activeCities}</div>
              <div className="text-xs text-slate-500">Reseau territorial</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {locale === 'de' ? 'Lieferungen / Tag' : locale === 'it' ? 'Consegne / giorno' : locale === 'en' ? 'Deliveries / day' : 'Livraisons / jour'}
              </div>
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
                {tx.regionalTotals}
              </p>
            </div>
            {isRegionRequired && !effectiveSelectedRegionId && (
              <div className="text-xs font-semibold text-amber-600">
                {tx.selectRegionForPdf}
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {regionAggregates.map((region) => (
              <button
                key={region.id}
                onClick={() => handleRegionChange(region.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  effectiveSelectedRegionId === region.id
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
                  Subvention: {formatCHF(region.subvention, localeTag)}
                </div>
                <div className="text-xs text-slate-500">
                  Volume: {formatCHF(region.volume, localeTag)}
                </div>
              </button>
            ))}
          </div>
          {effectiveSelectedRegionId && (
            <div className="mt-4">
              <button
                onClick={() => handleRegionChange('')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                {tx.backToGlobal}
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{tx.topShopsMonth}</h2>
                <p className="text-xs text-slate-500">{tx.commercialImpactByVolume}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {topShops.length === 0 ? (
                <div className="text-sm text-slate-500">{tx.noActiveShop}</div>
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
            <h2 className="text-sm font-semibold text-slate-900">{tx.envImpact}</h2>
            <p className="text-xs text-slate-500">{tx.envMonthMeasure}</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">CO2 economise</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {co2SavedKg.toFixed(1)} kg
                </div>
                <div className="text-xs text-emerald-700/80">{tx.versusCar}</div>
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
                  {formatCHF(averageBasketValue, localeTag)}
                </div>
                <div className="text-xs text-slate-500">Valeur par livraison</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{tx.detailByShop}</h2>
              <p className="text-xs text-slate-500">{tx.trackingByPartner}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
              >
                {tx.exportCsv}
              </button>
              <button
                onClick={handleHqPdf}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {tx.downloadPdf}
              </button>
            </div>
          </div>

          {regionOptions.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => handleRegionChange('')}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  !effectiveSelectedRegionId
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
                    effectiveSelectedRegionId === region.id
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
                        {detailColumnLabels[col] ?? col}
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
                                title={isAvailable ? tx.downloadPdf : tx.noPdfDoc}
                              >
                                {tx.downloadPdf}
                              </button>
                            </td>
                          )
                        }

                        const value = row[col]
                        return (
                          <td key={col} className="border border-slate-100 px-3 py-2 whitespace-nowrap">
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
    </div>
  )
}
