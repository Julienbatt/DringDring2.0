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
    title: locale === 'de' ? 'Abrechnung - Partnergemeinde' : locale === 'it' ? 'Fatturazione - Comune partner' : locale === 'en' ? 'Billing - Partner city' : 'Facturation - Commune partenaire',
    period: locale === 'de' ? 'Zeitraum' : locale === 'it' ? 'Periodo' : locale === 'en' ? 'Period' : 'Periode',
    loading: locale === 'de' ? 'Monatliche Abrechnung wird geladen...' : locale === 'it' ? 'Caricamento della fatturazione mensile...' : locale === 'en' ? 'Loading monthly billing...' : 'Chargement de la facturation mensuelle...',
    noDataTitle: locale === 'de' ? 'Keine Daten fur' : locale === 'it' ? 'Nessun dato per' : locale === 'en' ? 'No data for' : 'Aucune donnee sur',
    noDataBody: locale === 'de' ? 'Kein konsolidierter Rechnungsfluss fur diesen Zeitraum.' : locale === 'it' ? 'Nessun flusso fatturato consolidato per questo periodo.' : locale === 'en' ? 'No consolidated billing flow for this period.' : 'Aucun flux facture n\'est disponible pour cette periode.',
    previousMonth: locale === 'de' ? 'Vorherigen Monat anzeigen' : locale === 'it' ? 'Vedi mese precedente' : locale === 'en' ? 'View previous month' : 'Voir le mois precedent',
    openBilling: locale === 'de' ? 'Abrechnungsansicht offnen' : locale === 'it' ? 'Apri vista fatturazione' : locale === 'en' ? 'Open billing view' : 'Ouvrir la vue facturation',
    budgetVolume: locale === 'de' ? 'Budget & Volumen' : locale === 'it' ? 'Budget e volume' : locale === 'en' ? 'Budget & volume' : 'Budget & volume',
    financialImpact: locale === 'de' ? 'Finanzieller Impact' : locale === 'it' ? 'Impatto finanziario' : locale === 'en' ? 'Financial impact' : 'Impact financier',
    municipalSubsidy: locale === 'de' ? 'Gemeindesubvention' : locale === 'it' ? 'Sovvenzione comunale' : locale === 'en' ? 'Municipal subsidy' : 'Subvention communale',
    totalVolume: locale === 'de' ? 'Gesamtvolumen' : locale === 'it' ? 'Volume totale' : locale === 'en' ? 'Total volume' : 'Volume total',
    deliveries: locale === 'de' ? 'Lieferungen' : locale === 'it' ? 'Consegne' : locale === 'en' ? 'Deliveries' : 'Livraisons',
    socialImpact: locale === 'de' ? 'Sozialer Impact' : locale === 'it' ? 'Impatto sociale' : locale === 'en' ? 'Social impact' : 'Public & social',
    cmsImpact: locale === 'de' ? 'CMS-Impact' : locale === 'it' ? 'Impatto CMS' : locale === 'en' ? 'CMS impact' : 'Impact CMS',
    loadingShort: locale === 'de' ? 'Wird geladen...' : locale === 'it' ? 'Caricamento...' : locale === 'en' ? 'Loading...' : 'Chargement...',
    cmsDeliveries: locale === 'de' ? 'CMS-Lieferungen' : locale === 'it' ? 'Consegne CMS' : locale === 'en' ? 'CMS deliveries' : 'Livraisons CMS',
    cmsShare: locale === 'de' ? 'CMS-Anteil' : locale === 'it' ? '% consegne CMS' : locale === 'en' ? '% CMS deliveries' : '% livraisons CMS',
    cmsCoverage: locale === 'de' ? 'CMS-Ubernahme' : locale === 'it' ? 'Copertura CMS' : locale === 'en' ? 'CMS coverage' : 'Prise en charge CMS',
    priorityAudience: locale === 'de' ? 'Prioritares Publikum' : locale === 'it' ? 'Pubblico prioritario' : locale === 'en' ? 'Priority audience' : 'Public prioritaire',
    serviceCoverage: locale === 'de' ? 'Service & Abdeckung' : locale === 'it' ? 'Servizio e copertura' : locale === 'en' ? 'Service & coverage' : 'Service & couverture',
    paceReach: locale === 'de' ? 'Rhythmus & Reichweite' : locale === 'it' ? 'Ritmo e copertura' : locale === 'en' ? 'Pace & reach' : 'Rythme & reach',
    uniqueBeneficiaries: locale === 'de' ? 'Einmalige Begunstigte' : locale === 'it' ? 'Beneficiari unici' : locale === 'en' ? 'Unique beneficiaries' : 'Beneficiaires uniques',
    households: locale === 'de' ? 'Betreute Haushalte' : locale === 'it' ? 'Nuclei serviti' : locale === 'en' ? 'Households served' : 'Menages servis',
    activeShops: locale === 'de' ? 'Aktive Geschafte' : locale === 'it' ? 'Negozi attivi' : locale === 'en' ? 'Active shops' : 'Commerces actifs',
    avgBags: locale === 'de' ? 'Durchschnitt Sacke' : locale === 'it' ? 'Borse medie' : locale === 'en' ? 'Average bags' : 'Sacs moyens',
    activeDays: locale === 'de' ? 'Aktive Tage' : locale === 'it' ? 'Giorni attivi' : locale === 'en' ? 'Active days' : 'Jours actifs',
    perDay: locale === 'de' ? 'Lieferungen / Tag' : locale === 'it' ? 'Consegne / giorno' : locale === 'en' ? 'Deliveries / day' : 'Livraisons / jour',
    efficiency: locale === 'de' ? 'Effizienz' : locale === 'it' ? 'Efficienza' : locale === 'en' ? 'Efficiency' : 'Efficience',
    averageCost: locale === 'de' ? 'Durchschnittskosten' : locale === 'it' ? 'Costo medio' : locale === 'en' ? 'Average cost' : 'Cout moyen',
    subsidyPerDelivery: locale === 'de' ? 'Subvention / Lieferung' : locale === 'it' ? 'Sovvenzione / consegna' : locale === 'en' ? 'Subsidy / delivery' : 'Subvention / livraison',
    subsidyPerBeneficiary: locale === 'de' ? 'Subvention / Begunstigter' : locale === 'it' ? 'Sovvenzione / beneficiario' : locale === 'en' ? 'Subsidy / beneficiary' : 'Subvention / beneficiaire',
    monthlyAverage: locale === 'de' ? 'Monatsdurchschnitt' : locale === 'it' ? 'Media mensile' : locale === 'en' ? 'Monthly average' : 'Moyenne du mois',
    envImpact: locale === 'de' ? 'Umweltimpact' : locale === 'it' ? 'Impatto ambientale' : locale === 'en' ? 'Environmental impact' : 'Impact environnemental',
    softMobility: locale === 'de' ? 'Sanfte Mobilitat' : locale === 'it' ? 'Mobilita dolce' : locale === 'en' ? 'Soft mobility' : 'Mobilite douce',
    bikeKm: locale === 'de' ? 'Km mit Velo (Monat)' : locale === 'it' ? 'Km in bici (mese)' : locale === 'en' ? 'Bike km (month)' : 'Km a velo (mois)',
    co2Saved: locale === 'de' ? 'CO2 eingespart (kg)' : locale === 'it' ? 'CO2 risparmiata (kg)' : locale === 'en' ? 'CO2 saved (kg)' : 'CO2 economise (kg)',
    detailByShop: locale === 'de' ? 'Detail nach Geschaft' : locale === 'it' ? 'Dettaglio per negozio' : locale === 'en' ? 'Detail by shop' : 'Detail par commerce',
    exportCsv: locale === 'de' ? 'CSV exportieren' : locale === 'it' ? 'Esporta CSV' : locale === 'en' ? 'Export CSV' : 'Exporter CSV',
    downloadPdf: locale === 'de' ? 'PDF herunterladen' : locale === 'it' ? 'Scarica PDF' : locale === 'en' ? 'Download PDF' : 'Telecharger PDF',
    noDetail: locale === 'de' ? 'Keine Details verfugbar.' : locale === 'it' ? 'Nessun dettaglio disponibile.' : locale === 'en' ? 'No details available.' : 'Aucun detail disponible.',
    monthPrevAria: locale === 'de' ? 'Vorheriger Monat' : locale === 'it' ? 'Mese precedente' : locale === 'en' ? 'Previous month' : 'Mois precedent',
    monthNextAria: locale === 'de' ? 'Nachster Monat' : locale === 'it' ? 'Mese successivo' : locale === 'en' ? 'Next month' : 'Mois suivant',
    yearPrevAria: locale === 'de' ? 'Vorheriges Jahr' : locale === 'it' ? 'Anno precedente' : locale === 'en' ? 'Previous year' : 'Annee precedente',
    yearNextAria: locale === 'de' ? 'Nächstes Jahr' : locale === 'it' ? 'Anno successivo' : locale === 'en' ? 'Next year' : 'Annee suivante',
    partnerCity: locale === 'de' ? 'Partnergemeinde' : locale === 'it' ? 'Comune partner' : locale === 'en' ? 'Partner city' : 'Commune partenaire',
    participationVelocite: locale === 'de' ? 'Beteiligung Velocite' : locale === 'it' ? 'Partecipazione Velocite' : locale === 'en' ? 'Velocite share' : 'Participation Velocite',
    thisMonth: locale === 'de' ? 'Diesen Monat' : locale === 'it' ? 'Questo mese' : locale === 'en' ? 'This month' : 'Ce mois',
    monthInProgress: locale === 'de' ? 'Laufender Monat' : locale === 'it' ? 'Mese in corso' : locale === 'en' ? 'Current month' : 'Mois en cours',
    activeDaysHint: locale === 'de' ? 'Aktive Tage' : locale === 'it' ? 'Giorni attivi' : locale === 'en' ? 'Active days' : 'Jours actifs',
    totalBags: locale === 'de' ? 'Total Sacke' : locale === 'it' ? 'Totale borse' : locale === 'en' ? 'Total bags' : 'Total sacs',
    estimateRoundTrip: locale === 'de' ? 'Hin- und Ruckweg Schatzung' : locale === 'it' ? 'Stima andata-ritorno' : locale === 'en' ? 'Round-trip estimate' : 'Estimation aller-retour',
    carBase: locale === 'de' ? 'Basis Auto 93.6 g/km' : locale === 'it' ? 'Base auto 93.6 g/km' : locale === 'en' ? 'Car baseline 93.6 g/km' : 'Base voiture 93.6 g/km',
  } as const
  const detailColumnLabels: Record<string, string> = {
    shop_name: locale === 'de' ? 'Geschaft' : locale === 'it' ? 'Negozio' : locale === 'en' ? 'Shop' : 'Commerce',
    total_deliveries: tx.deliveries,
    total_subvention_due: locale === 'de' ? 'Subvention (CHF)' : locale === 'it' ? 'Sovvenzione (CHF)' : locale === 'en' ? 'Subsidy (CHF)' : 'Subvention (CHF)',
    total_volume_chf: locale === 'de' ? 'Total CHF' : locale === 'it' ? 'Totale CHF' : locale === 'en' ? 'Total CHF' : 'Total CHF',
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

  const cityName =
    rows[0]?.city_name ?? rows[0]?.city_id ?? user?.city_id ?? tx.partnerCity
  const cityId = rows[0]?.city_id ?? user?.city_id ?? ''
  const detailRows = shopData ?? []

  const handleExport = async () => {
    await downloadCsv(
      `/reports/city-billing/export?month=${encodeURIComponent(selectedMonth)}`,
      locale === 'de' ? 'abrechnung-gemeinde.csv' : locale === 'it' ? 'fatturazione-comune.csv' : locale === 'en' ? 'city-billing.csv' : 'facturation-commune.csv'
    )
  }

  const handlePdfExport = async () => {
    if (!cityId) return
    await downloadPdf(
      `/reports/city-monthly-pdf?city_id=${encodeURIComponent(
        cityId
      )}&month=${encodeURIComponent(selectedMonth)}`,
      `${locale === 'de' ? 'abrechnung-gemeinde' : locale === 'it' ? 'fatturazione-comune' : locale === 'en' ? 'city-billing' : 'facturation-commune'}-${selectedMonth}.pdf`
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
                {cityStats.cms_share_pct.toFixed(1)}% des livraisons
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">{tx.cmsShare}</div>
              <div className="text-2xl font-semibold">
                {cityStats.cms_share_pct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">Part du total</div>
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
              <div className="text-xs text-gray-400">Public prioritaire</div>
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
