'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MonthInput } from '@/components/ui/month-input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiGet, API_BASE_URL } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatCurrencyCHF, formatDate, formatMonthYear } from '@/lib/i18n/format'
import { captureError } from '@/lib/errorReporting'

type CitySummaryRow = {
  city_id: string
  city_name: string
  billing_month: string
  total_deliveries: number
  total_amount_due: number | string
  total_volume_chf: number | string
}

type CityShopRow = {
  shop_id: string
  shop_name: string
  city_name: string
  total_deliveries: number
  total_subvention_due: number | string
  total_volume_chf: number | string
}

type CityDeliveryRow = {
  delivery_id: string
  delivery_date: string
  shop_id: string
  shop_name: string
  city_name: string
  client_name: string | null
  address: string | null
  postal_code: string | null
  delivery_city: string | null
  bags: number | null
  is_cms: boolean | null
  time_window: string | null
  total_price: number | string | null
  share_city: number | string | null
  share_admin_region: number | string | null
  share_client: number | string | null
}

function getCurrentMonth() {
  const now = new Date()
  now.setMonth(now.getMonth() - 1)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function shiftMonth(value: string, delta: number) {
  const [yearRaw, monthRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  const date = new Date(year, month - 1 + delta, 1)
  const nextYear = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

export default function CityBillingPage() {
  const { user } = useAuth()
  const { locale, t } = useLanguage()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [summary, setSummary] = useState<CitySummaryRow | null>(null)
  const [shops, setShops] = useState<CityShopRow[]>([])
  const [deliveries, setDeliveries] = useState<CityDeliveryRow[]>([])
  const [selectedShopId, setSelectedShopId] = useState('all')
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'cms' | 'non_cms'>('all')
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!user?.city_id) return
    loadData()
    loadDeliveries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, user?.city_id])

  const loadData = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const summaryRows = await apiGet<CitySummaryRow[]>(
        `/reports/city-billing?month=${selectedMonth}`,
        session.access_token
      )
      setSummary(summaryRows[0] || null)

      const shopRows = await apiGet<CityShopRow[]>(
        `/reports/city-billing-shops?month=${selectedMonth}`,
        session.access_token
      )
      setShops(shopRows)
    } catch (error) {
      captureError(error, 'CityBillingPage.loadData')
      toast.error(t('billing.city.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const loadDeliveries = async () => {
    if (!user?.city_id) return
    setDetailLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const rows = await apiGet<CityDeliveryRow[]>(
        `/reports/city-billing-deliveries?city_id=${user.city_id}&month=${selectedMonth}`,
        session.access_token
      )
      setDeliveries(rows)
    } catch (error) {
      captureError(error, 'CityBillingPage.loadDeliveries')
      toast.error(t('billing.city.loadDetailsError'))
    } finally {
      setDetailLoading(false)
    }
  }

  const downloadCsv = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const apiBase = API_BASE_URL
      if (!apiBase) return

      const response = await fetch(`${apiBase}/reports/city-billing/export?month=${selectedMonth}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error('Export CSV impossible')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `facturation-commune-${selectedMonth}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      captureError(error, 'CityBillingPage.downloadCsv')
      toast.error(t('billing.city.exportError'))
    }
  }

  const downloadPdf = async () => {
    if (!user?.city_id) return
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const apiBase = API_BASE_URL
      if (!apiBase) return

      const url = `${apiBase}/reports/city-monthly-pdf?city_id=${user.city_id}&month=${selectedMonth}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error('PDF indisponible (periode non gelee)')

      const blob = await response.blob()
      const urlObject = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = urlObject
      a.download = `facturation-commune-${selectedMonth}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(urlObject)
    } catch (error) {
      captureError(error, 'CityBillingPage.downloadPdf')
      toast.error(t('billing.city.pdfError'))
    }
  }

  const filteredByShop = selectedShopId === 'all'
    ? deliveries
    : deliveries.filter((row) => row.shop_id === selectedShopId)

  const visibleDetails =
    audienceFilter === 'all'
      ? filteredByShop
      : filteredByShop.filter((row) =>
          audienceFilter === 'cms' ? row.is_cms : !row.is_cms
        )

  const cmsDeliveries = deliveries.filter((row) => row.is_cms).length
  const cmsSharePct = deliveries.length
    ? (cmsDeliveries / deliveries.length) * 100
    : 0

  if (!user?.city_id) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <h1 className="text-xl font-semibold text-slate-900">{t('billing.city.incompleteAccess')}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('billing.city.incompleteAccessBody')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('billing.city.title')}</h1>
          <p className="text-muted-foreground">{t('billing.city.subtitle')}</p>
          <p className="text-xs text-emerald-700 mt-1">
            {t('billing.city.period')}: {formatMonthYear(`${selectedMonth}-01`, locale)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm">
            <button
              type="button"
              onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label={t('billing.city.monthPrev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <MonthInput
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              wrapperClassName="mx-1 min-w-[140px]"
              className="h-8 rounded-full border-0 bg-transparent px-3 py-0 text-center text-sm font-medium text-slate-700 shadow-none focus-visible:ring-0"
              aria-label={t('billing.city.monthSelect')}
              pickerAriaLabel={t('common.openCalendar')}
            />
            <button
              type="button"
              onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label={t('billing.city.monthNext')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t('billing.city.exportCsv')}
          </Button>
          <Button variant="default" onClick={downloadPdf}>
            <FileText className="mr-2 h-4 w-4" />
            {t('billing.city.officialPdf')}
          </Button>
        </div>
      </div>

      {!loading && !summary && shops.length === 0 && deliveries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            {t('billing.city.noDataTitle')} {formatMonthYear(`${selectedMonth}-01`, locale)}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('billing.city.noDataBody')}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">{t('billing.city.totalVolume')}</div>
          <div className="text-2xl font-bold">
            {formatCurrencyCHF(Number(summary?.total_volume_chf || 0), locale)}
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">{t('billing.city.deliveries')}</div>
          <div className="text-2xl font-bold">{summary?.total_deliveries || 0}</div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">{t('billing.city.citySubsidy')}</div>
          <div className="text-2xl font-bold">
            {formatCurrencyCHF(Number(summary?.total_amount_due || 0), locale)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('billing.city.periodBudget')}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">{t('billing.city.cmsDeliveries')}</div>
          <div className="text-2xl font-bold">{cmsDeliveries}</div>
          <div className="text-xs text-muted-foreground">
            {cmsSharePct.toFixed(1)}% {t('billing.city.ofDeliveries')}
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">{t('billing.city.priorityAudience')}</div>
          <div className="text-2xl font-bold">{t('billing.city.cmsShort')}</div>
          <div className="text-xs text-muted-foreground">
            {t('billing.city.priorityAudienceDesc')}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('billing.city.shop')}</TableHead>
              <TableHead>{t('billing.city.city')}</TableHead>
              <TableHead className="text-right">{t('billing.city.deliveries')}</TableHead>
              <TableHead className="text-right">{t('billing.city.subsidyChf')}</TableHead>
              <TableHead className="text-right">{t('billing.city.totalChf')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">{t('billing.city.loading')}</TableCell>
              </TableRow>
            ) : shops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t('billing.city.noDataForPeriod')}
                </TableCell>
              </TableRow>
            ) : (
              shops.map((row) => (
                <TableRow key={row.shop_id}>
                  <TableCell className="font-medium">{row.shop_name}</TableCell>
                  <TableCell>{row.city_name}</TableCell>
                  <TableCell className="text-right">{row.total_deliveries}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyCHF(Number(row.total_subvention_due || 0), locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyCHF(Number(row.total_volume_chf || 0), locale)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border bg-white p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{t('billing.city.deliveryDetails')}</div>
            <div className="text-sm text-muted-foreground">
              {t('billing.city.deliveryDetailsHint')}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="border rounded px-3 py-2 text-sm"
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
            >
              <option value="all">{t('billing.city.allShops')}</option>
              {shops.map((row) => (
                <option key={row.shop_id} value={row.shop_id}>
                  {row.shop_name}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={audienceFilter}
              onChange={(e) =>
                setAudienceFilter(e.target.value as 'all' | 'cms' | 'non_cms')
              }
            >
              <option value="all">{t('billing.city.allAudiences')}</option>
              <option value="cms">{t('billing.city.cmsAudience')}</option>
              <option value="non_cms">{t('billing.city.standardAudience')}</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('billing.city.date')}</TableHead>
                <TableHead>{t('billing.city.shop')}</TableHead>
                <TableHead>{t('billing.city.client')}</TableHead>
                <TableHead>{t('billing.city.address')}</TableHead>
                <TableHead>{t('billing.city.postalCode')}</TableHead>
                <TableHead>{t('billing.city.city')}</TableHead>
                <TableHead>{t('billing.city.audience')}</TableHead>
                <TableHead className="text-right">{t('billing.city.bags')}</TableHead>
                <TableHead className="text-right">{t('billing.city.totalChf')}</TableHead>
                <TableHead className="text-right">{t('billing.city.cityShare')}</TableHead>
                <TableHead className="text-right">{t('billing.city.regionShare')}</TableHead>
                <TableHead className="text-right">{t('billing.city.clientShare')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-20 text-center">{t('billing.city.loading')}</TableCell>
                </TableRow>
              ) : visibleDetails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-20 text-center text-muted-foreground">
                    {t('billing.city.noDeliveriesForPeriod')}
                  </TableCell>
                </TableRow>
              ) : (
                visibleDetails.map((row) => (
                  <TableRow key={row.delivery_id}>
                    <TableCell>{formatDate(row.delivery_date, locale)}</TableCell>
                    <TableCell>{row.shop_name}</TableCell>
                    <TableCell>{row.client_name || '-'}</TableCell>
                    <TableCell>{row.address || '-'}</TableCell>
                    <TableCell>{row.postal_code || '-'}</TableCell>
                    <TableCell>{row.delivery_city || row.city_name}</TableCell>
                    <TableCell>{row.is_cms ? 'CMS' : t('billing.city.standard')}</TableCell>
                    <TableCell className="text-right">{row.bags ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCHF(Number(row.total_price || 0), locale)}
                    </TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyCHF(Number(row.share_city || 0), locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyCHF(Number(row.share_admin_region || 0), locale)}
                      </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCHF(Number(row.share_client || 0), locale)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
