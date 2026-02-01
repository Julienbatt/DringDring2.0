'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { API_BASE_URL } from '@/lib/api'
import { useShopDeliveries } from '../../reports/hooks/useShopDeliveries'
import { useShopPeriods } from '../../reports/hooks/useShopPeriods'
import { Button } from '@/components/ui/button'
import { useMe } from '../../hooks/useMe'

type ShopDeliveryRow = Record<string, any>

function getCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function formatCHF(value: number) {
  return `CHF ${value.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatMonth(value: string) {
  const date = new Date(value.length === 7 ? `${value}-01` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
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

export default function ShopBillingPage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const { data: deliveries, loading, error } = useShopDeliveries(selectedMonth)
  const { data: periods, loading: periodsLoading, error: periodsError } = useShopPeriods()
  const { data: me } = useMe()
  const [downloading, setDownloading] = useState<string | null>(null)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => Number(getCurrentMonth().split('-')[0]))
  const monthPickerRef = useRef<HTMLDivElement | null>(null)
  const isHqDependentShop = Boolean(me?.role === 'shop' && me?.hq_id)

  const activeDeliveries = (deliveries ?? []).filter(
    (row: ShopDeliveryRow) => String(row.status || '').toLowerCase() !== 'cancelled'
  )
  const totalDeliveries = activeDeliveries.length
  const totalAdminRegion = activeDeliveries.reduce(
    (acc: number, row: ShopDeliveryRow) => acc + (Number(row.share_admin_region) || 0),
    0
  )
  const totalBags = activeDeliveries.reduce(
    (acc: number, row: ShopDeliveryRow) => acc + (Number(row.bags) || 0),
    0
  )

  const handleDownloadPdf = async (month: string, shopId?: string) => {
    setDownloading(month)
    try {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) return

      const res = await fetch(
        `${API_BASE_URL}/reports/shop-monthly-pdf?shop_id=${shopId || ''}&month=${month}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      )
      if (!res.ok) throw new Error('PDF indisponible')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `facture-commerce-${month}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadCsv = async (month: string) => {
    setDownloading(month)
    try {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) return

      const res = await fetch(
        `${API_BASE_URL}/reports/shop-export?month=${month}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      )
      if (!res.ok) throw new Error('CSV indisponible')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `livraisons-commerce-${month}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    } finally {
      setDownloading(null)
    }
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
    .map((value, index) => (index === 0 ? Number(value) : Number(value) - 1)) as [number, number]

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
    const nextValue = getMonthValue(date.getFullYear(), date.getMonth())
    setSelectedMonth(nextValue)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturation commerce</h1>
          <p className="text-muted-foreground">
            Historique mensuel, totaux et PDFs officiels.
          </p>
        </div>
        <div className="relative" ref={monthPickerRef}>
          <div className="flex items-center gap-1 rounded-full border bg-white px-1.5 py-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => stepMonth(-1)}
              aria-label="Mois precedent"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => setMonthPickerOpen((prev) => !prev)}
            >
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>{formatMonthLabel(selectedYear, selectedMonthIndex)}</span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => stepMonth(1)}
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {monthPickerOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-[260px] rounded-xl border bg-white p-3 shadow-lg">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPickerYear((prev) => prev - 1)}
                  aria-label="Annee precedente"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-semibold">{pickerYear}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPickerYear((prev) => prev + 1)}
                  aria-label="Annee suivante"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {MONTH_SHORT_LABELS.map((label, index) => {
                  const isSelected = pickerYear === selectedYear && index === selectedMonthIndex
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
                        setSelectedMonth(getMonthValue(pickerYear, index))
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Montant facture (TTC)</div>
          <div className="text-2xl font-bold">{formatCHF(totalAdminRegion)}</div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Livraisons</div>
          <div className="text-2xl font-bold">{totalDeliveries}</div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Sacs</div>
          <div className="text-2xl font-bold">{totalBags}</div>
        </div>
      </div>

      <div className="rounded-md border bg-white p-4 space-y-4">
        <div className="text-lg font-semibold">Historique des livraisons</div>
        {loading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : activeDeliveries.length > 0 ? (
          <div className="overflow-auto border rounded">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">Date</th>
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">Client</th>
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">Adresse</th>
                  <th className="border px-3 py-2 text-right font-medium text-gray-700">Sacs</th>
                  <th className="border px-3 py-2 text-right font-medium text-gray-700">Montant facture (TTC)</th>
                </tr>
              </thead>
              <tbody>
                {activeDeliveries.map((row, index) => (
                  <tr key={index} className="odd:bg-white even:bg-gray-50">
                    <td className="border px-3 py-2 whitespace-nowrap">
                      {String(row.delivery_date || '').slice(0, 10)}
                    </td>
                    <td className="border px-3 py-2 whitespace-nowrap">{row.client_name || '-'}</td>
                    <td className="border px-3 py-2 whitespace-nowrap">{row.address || '-'}</td>
                    <td className="border px-3 py-2 text-right">{row.bags ?? '-'}</td>
                    <td className="border px-3 py-2 text-right">
                      {formatCHF(Number(row.share_admin_region) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Aucune livraison.</div>
        )}
      </div>

      <div className="rounded-md border bg-white p-4 space-y-4">
        <div className="text-lg font-semibold">Factures par periode</div>
        {isHqDependentShop ? (
          <div className="text-sm text-gray-500">
            Facturation geree par le HQ. Aucun PDF commerce n&apos;est disponible pour ce compte.
          </div>
        ) : periodsLoading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : periodsError ? (
          <div className="text-sm text-red-600">{periodsError}</div>
        ) : periods && periods.length > 0 ? (
          <div className="overflow-auto border rounded">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">Type</th>
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">Payeur</th>
                  <th className="border px-3 py-2 text-right font-medium text-gray-700">Livraisons</th>
                  <th className="border px-3 py-2 text-right font-medium text-gray-700">Montant facture (TTC)</th>
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">Statut</th>
                  <th className="border px-3 py-2 text-right font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((row, index) => {
                  const periodKey = String(row.period_month).slice(0, 7)
                  const deliveriesCount = Number(row.deliveries || 0)
                  const amountTtc = Number(row.amount_ttc || 0)
                  const statusLabel = row.frozen_at ? 'Gelee' : 'En cours'
                  return (
                    <tr key={index} className="odd:bg-white even:bg-gray-50">
                      <td className="border px-3 py-2">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          Commerce
                        </span>
                      </td>
                      <td className="border px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {row.shop_name || 'Commerce'}
                        </div>
                        <div className="text-xs text-slate-500">{formatMonth(row.period_month)}</div>
                      </td>
                      <td className="border px-3 py-2 text-right">{deliveriesCount}</td>
                      <td className="border px-3 py-2 text-right">{formatCHF(amountTtc)}</td>
                      <td className="border px-3 py-2">
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          {statusLabel}
                        </span>
                      </td>
                      <td className="border px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadCsv(periodKey)}
                            disabled={downloading === periodKey}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadPdf(periodKey, row.shop_id)}
                            disabled={downloading === periodKey}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Aucune periode gelee.</div>
        )}
      </div>
    </div>
  )
}
