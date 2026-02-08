'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { apiGet, apiPost, API_BASE_URL } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type BillingDocument = {
    id: string
    recipient_type: 'COMMUNE' | 'HQ' | 'SHOP_INDEP' | 'INTERNAL'
    recipient_id: string
    recipient_name: string
    period_month: string
    amount_ht: number
    amount_vat: number
    amount_ttc: number
    vat_rate: number
    status: string
    deliveries: number
}

type BillingData = {
    month: string
    rows: BillingDocument[]
}

type BillingLine = {
    id: string
    document_id: string
    recipient_type: 'COMMUNE' | 'HQ' | 'SHOP_INDEP' | 'INTERNAL'
    recipient_id: string
    shop_id: string | null
    delivery_id: string | null
    amount_due: number
    delivery_date: string
    client_name: string | null
    commune_name: string | null
    bags: string | null
    shop_name: string | null
}

function getCurrentMonth() {
    const now = new Date()
    now.setMonth(now.getMonth() - 1)
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${now.getFullYear()}-${month}`
}

function formatMonth(value: string, locale: string) {
    const date = new Date(value.length === 7 ? `${value}-01` : value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export default function BillingPage() {
    const { adminContextRegion, user } = useAuth()
    const { t, locale } = useLanguage()
    const searchParams = useSearchParams()
    const router = useRouter()
    const paramMonth = searchParams.get('month')
    const [selectedMonth, setSelectedMonth] = useState(paramMonth ?? getCurrentMonth())
    const [data, setData] = useState<BillingData | null>(null)
    const [details, setDetails] = useState<BillingLine[]>([])
    const [loading, setLoading] = useState(false)
    const [detailLoading, setDetailLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [monthPickerOpen, setMonthPickerOpen] = useState(false)
    const [pickerYear, setPickerYear] = useState(() => Number(getCurrentMonth().split('-')[0]))
    const [externalFilter, setExternalFilter] = useState<'ALL' | 'COMMUNE' | 'HQ' | 'SHOP_INDEP'>('ALL')
    const [selectedRecipientKey, setSelectedRecipientKey] = useState<string>('all')
    const [previewMode, setPreviewMode] = useState(true)
    const [vatRate, setVatRate] = useState<number | null>(null)
    const monthPickerRef = useRef<HTMLDivElement | null>(null)
    const dataRequestRef = useRef(0)
    const detailsRequestRef = useRef(0)
    const vatRequestRef = useRef(0)
    const loadAllRequestRef = useRef(0)

    useEffect(() => {
        if (paramMonth && paramMonth !== selectedMonth) {
            setSelectedMonth(paramMonth)
        }
    }, [paramMonth, selectedMonth])

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


    const loadAll = useCallback(async () => {
        const requestId = ++loadAllRequestRef.current
        const dataRequestId = ++dataRequestRef.current
        const detailsRequestId = ++detailsRequestRef.current
        const vatRequestId = ++vatRequestRef.current
        setLoading(true)
        setDetailLoading(true)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return

            const queryParams = adminContextRegion ? `&admin_region_id=${adminContextRegion.id}` : ''
            const [docsRes, detailsRes, vatRes] = await Promise.all([
                apiGet<BillingData>(`/billing/documents?month=${selectedMonth}${queryParams}`, session.access_token),
                apiGet<BillingLine[]>(`/billing/documents/lines?month=${selectedMonth}${queryParams}`, session.access_token),
                apiGet<{ rate: number }>(`/settings/vat-rate?month=${selectedMonth}`, session.access_token),
            ])

            if (requestId !== loadAllRequestRef.current) return
            if (dataRequestId === dataRequestRef.current) {
                setData(docsRes)
            }
            if (detailsRequestId === detailsRequestRef.current) {
                setDetails(detailsRes)
            }
            if (vatRequestId === vatRequestRef.current) {
                setVatRate(typeof vatRes?.rate === 'number' ? vatRes.rate : null)
            }
        } catch (error) {
            console.error('Failed to load billing data', error)
            toast.error(t('admin.billing.toast.loadError'))
        } finally {
            if (requestId === loadAllRequestRef.current) {
                setLoading(false)
                setDetailLoading(false)
            }
        }
    }, [adminContextRegion, selectedMonth])

    useEffect(() => {
        setData(null)
        setDetails([])
        loadAll()
    }, [loadAll])

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return

            const queryParams = adminContextRegion ? `&admin_region_id=${adminContextRegion.id}` : ''
            await apiPost(
                `/billing/region/aggregate?month=${selectedMonth}${queryParams}`,
                {},
                session.access_token
            )
            loadAll()
            toast.success(t('admin.billing.toast.recalculated'))
        } catch (error) {
            console.error('Refresh failed', error)
            toast.error(t('admin.billing.toast.recalculateError'))
        } finally {
            setRefreshing(false)
        }
    }

    const handleExport = async (recipientType?: string, recipientId?: string, recipientName?: string) => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return

            const apiBase = API_BASE_URL
            const queryParams = adminContextRegion ? `&admin_region_id=${adminContextRegion.id}` : ''
            const typeParam = recipientType ? `&recipient_type=${recipientType}` : ''
            const recipientParam = recipientId ? `&recipient_id=${recipientId}` : ''
            const detailParam = '&detail=1'
            const response = await fetch(`${apiBase}/billing/documents/export?month=${selectedMonth}${queryParams}${typeParam}${recipientParam}${detailParam}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            })

            if (!response.ok) throw new Error('Export failed')

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const safeName = (recipientName || recipientType || 'documents').replace(/[^a-zA-Z0-9_-]+/g, '_')
            a.download = `facturation-details-${safeName}-${selectedMonth}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
        } catch (error) {
            console.error('Export failed', error)
            toast.error(t('admin.billing.toast.exportError'))
        }
    }

    const downloadZip = async (recipientType: 'COMMUNE' | 'HQ' | 'SHOP_INDEP', filename: string) => {
        try {
            if (!userIsRegional()) {
                toast.error(t('admin.billing.toast.selectRegion'))
                return
            }
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return

            const apiBase = API_BASE_URL
            if (!apiBase) return
            const queryParams = adminContextRegion ? `&admin_region_id=${adminContextRegion.id}` : ''
            const previewParam = previewMode ? '&preview=1' : ''
            const response = await fetch(`${apiBase}/billing/documents/zip?month=${selectedMonth}${queryParams}${previewParam}&recipient_type=${recipientType}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            })
            if (!response.ok) {
                const raw = await response.text()
                let detail = raw
                try {
                    const parsed = JSON.parse(raw)
                    detail = parsed?.detail || raw
                } catch {
                    detail = raw
                }
                if (response.status === 404 && (String(detail).includes('No billing documents found') || String(detail).includes('No deliveries for this period'))) {
                    toast.info(t('admin.billing.toast.noDocuments'))
                    return
                }
                throw new Error(detail || 'ZIP download failed')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('ZIP download failed', error)
            toast.error(t('admin.billing.toast.zipError'))
        }
    }

    const userIsRegional = () => {
        if (user?.role === 'super_admin') {
            return Boolean(adminContextRegion)
        }
        return true
    }

    const handleDownloadPdf = async (documentId: string, recipientName?: string) => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return

            const apiBase = API_BASE_URL
            const url = `${apiBase}/billing/documents/${documentId}/pdf?preview=${previewMode ? 1 : 0}`
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            })

            if (!response.ok) throw new Error('PDF download failed')

            const blob = await response.blob()
            const safeName = (recipientName || documentId).replace(/[^a-zA-Z0-9_-]+/g, '_')
            const filename = `facture-${safeName}-${selectedMonth}.pdf`
            const urlObject = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = urlObject
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(urlObject)
        } catch (error) {
            console.error('PDF download failed', error)
            toast.error(t('admin.billing.toast.downloadError'))
        }
    }

    const [selectedYear, selectedMonthIndex] = selectedMonth
        .split('-')
        .map((value, index) => (index === 0 ? Number(value) : Number(value) - 1)) as [number, number]

    const i18nLocaleMap = {
        fr: 'fr-CH',
        de: 'de-CH',
        it: 'it-CH',
        en: 'en-CH',
    } as const
    const dateLocale = i18nLocaleMap[locale] ?? 'fr-CH'

    const formatMonthLabel = (year: number, monthIndex: number) => {
        const date = new Date(year, monthIndex, 1)
        return new Intl.DateTimeFormat(dateLocale, { month: 'long', year: 'numeric' }).format(date)
    }

    const getMonthValue = (year: number, monthIndex: number) => {
        const monthValue = String(monthIndex + 1).padStart(2, '0')
        return `${year}-${monthValue}`
    }

    const stepMonth = (delta: number) => {
        const date = new Date(selectedYear, selectedMonthIndex + delta, 1)
        const nextValue = getMonthValue(date.getFullYear(), date.getMonth())
        setSelectedMonth(nextValue)
        const params = new URLSearchParams(searchParams.toString())
        params.set('month', nextValue)
        router.replace(`?${params.toString()}`)
    }

    const documents = data?.rows ?? []
    const externalDocuments = documents.filter((row) => row.recipient_type !== 'INTERNAL')
    const internalDocuments = documents.filter((row) => row.recipient_type === 'INTERNAL')
    const filteredExternalDocuments =
        externalFilter === 'ALL'
            ? externalDocuments
            : externalDocuments.filter((row) => row.recipient_type === externalFilter)

    const filteredExternalAmount = filteredExternalDocuments.reduce((acc, row) => acc + (Number(row.amount_ttc) || 0), 0)
    const filteredExternalDeliveries = filteredExternalDocuments.reduce((acc, row) => acc + (row.deliveries || 0), 0)
    const externalPayers = filteredExternalDocuments.length
    const totalDocuments = documents.length
    const hasAnyData = documents.length > 0 || details.length > 0

    const vatRateValue = vatRate ?? 0.081
    const totalBilledTtc = externalDocuments.reduce((sum, row) => sum + Number(row.amount_ttc || 0), 0)
    const totalBilledHt = externalDocuments.reduce((sum, row) => sum + Number(row.amount_ht || 0), 0)
    const totalBilledVat = externalDocuments.reduce((sum, row) => sum + Number(row.amount_vat || 0), 0)

    const documentById = new Map(documents.map((doc) => [doc.id, doc]))
    const externalDetails = details.filter((row) => row.recipient_type !== 'INTERNAL')
    const visibleDetails = externalDetails.filter((row) => {
        if (externalFilter !== 'ALL' && row.recipient_type !== externalFilter) return false
        if (selectedRecipientKey === 'all') return true
        const [selectedType, selectedId] = selectedRecipientKey.split(':')
        return row.recipient_type === selectedType && row.recipient_id === selectedId
    })

    const handleInternalPdf = () => {
        const internalDoc = internalDocuments[0]
        if (!internalDoc) {
            toast.info(t('admin.billing.toast.noInternalDocument'))
            return
        }
        handleDownloadPdf(internalDoc.id, internalDoc.recipient_name)
    }

    const monthShortLabels = Array.from({ length: 12 }, (_, index) =>
        new Intl.DateTimeFormat(dateLocale, { month: 'short' }).format(new Date(2026, index, 1))
    )

    const recipientTypeLabels: Record<BillingDocument['recipient_type'], string> = {
        COMMUNE: t('admin.billing.recipientType.city'),
        HQ: t('admin.billing.recipientType.hq'),
        SHOP_INDEP: t('admin.billing.recipientType.independentShop'),
        INTERNAL: t('admin.billing.recipientType.internal'),
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('admin.billing.title')}</h1>
                    <p className="text-muted-foreground">{t('admin.billing.subtitle')}</p>
                    <p className="text-xs text-emerald-700 mt-1">
                        {t('admin.billing.period')}: {formatMonth(selectedMonth, dateLocale)}.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
                    <div className="flex w-full flex-wrap items-center justify-between gap-3 xl:justify-end">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative" ref={monthPickerRef}>
                                <div className="flex items-center gap-1 rounded-full border bg-white px-1.5 py-1 shadow-sm">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => stepMonth(-1)}
                                        aria-label={t('admin.billing.prevMonth')}
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
                                        aria-label={t('admin.billing.nextMonth')}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                {monthPickerOpen ? (
                                    <div className="absolute z-20 mt-2 w-[260px] rounded-xl border bg-white p-3 shadow-lg">
                                        <div className="flex items-center justify-between">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => setPickerYear((prev) => prev - 1)}
                                                aria-label={t('admin.billing.prevYear')}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-semibold">{pickerYear}</div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => setPickerYear((prev) => prev + 1)}
                                                aria-label={t('admin.billing.nextYear')}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="mt-2 grid grid-cols-3 gap-2">
                                            {monthShortLabels.map((label, index) => {
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
                                                            const nextValue = getMonthValue(pickerYear, index)
                                                            setSelectedMonth(nextValue)
                                                            const params = new URLSearchParams(searchParams.toString())
                                                            params.set('month', nextValue)
                                                            router.replace(`?${params.toString()}`)
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
                            <label className="flex items-center gap-2 rounded border px-3 py-2 text-xs text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={previewMode}
                                    onChange={(e) => setPreviewMode(e.target.checked)}
                                />
                                {t('admin.billing.preview')}
                            </label>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleRefresh}
                            disabled={loading || refreshing}
                            variant="default"
                        >
                            {refreshing ? t('admin.billing.recalculating') : t('admin.billing.recalculate')}
                        </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" onClick={handleInternalPdf}>
                                <FileText className="mr-2 h-4 w-4" />
                                {t('admin.billing.pdfInternal')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadZip('HQ', `factures-hq-${selectedMonth}.zip`)}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                {t('admin.billing.pdfHq')}
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadZip('COMMUNE', `factures-communes-${selectedMonth}.zip`)}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                {t('admin.billing.pdfCities')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadZip('SHOP_INDEP', `factures-commerces-${selectedMonth}.zip`)}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                {t('admin.billing.pdfIndependentShops')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {!loading && !hasAnyData ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:p-6">
                    <h2 className="text-sm font-semibold text-slate-900">
                        {t('admin.billing.noDataTitle')} {formatMonth(selectedMonth)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                        {t('admin.billing.noDataBody')}
                    </p>
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="text-sm font-medium text-muted-foreground">{t('admin.billing.kpi.totalTtc')}</div>
                    <div className="text-2xl font-bold">
                        CHF {totalBilledTtc.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{t('admin.billing.kpi.externalInvoices')}</div>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="text-sm font-medium text-muted-foreground">
                        TVA {(vatRateValue * 100).toFixed(1)}%
                    </div>
                    <div className="text-2xl font-bold">
                        CHF {totalBilledVat.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{t('admin.billing.kpi.vatLoad')}</div>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="text-sm font-medium text-muted-foreground">{t('admin.billing.kpi.totalHt')}</div>
                    <div className="text-2xl font-bold">
                        CHF {totalBilledHt.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-6">
                    <div className="text-sm font-medium text-emerald-800">{t('admin.billing.kpi.activeExternalPayers')}</div>
                    <div className="text-2xl font-bold text-slate-900">{externalPayers}</div>
                    <div className="text-xs text-emerald-700 mt-1">
                        {filteredExternalDeliveries} {t('admin.billing.kpi.deliveries')} | {totalDocuments} {t('admin.billing.kpi.documents')}
                    </div>
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
                    <div>
                        <div className="text-lg font-semibold">{t('admin.billing.external.title')}</div>
                        <div className="text-sm text-muted-foreground">
                            {t('admin.billing.external.subtitle')}
                        </div>
                    </div>
                    <select
                        className="border rounded px-3 py-2 text-sm"
                        value={externalFilter}
                        onChange={(e) => {
                            setExternalFilter(e.target.value as typeof externalFilter)
                            setSelectedRecipientKey('all')
                        }}
                    >
                        <option value="ALL">{t('admin.billing.external.filter.all')}</option>
                        <option value="COMMUNE">{t('admin.billing.external.filter.cities')}</option>
                        <option value="HQ">{t('admin.billing.external.filter.hq')}</option>
                        <option value="SHOP_INDEP">{t('admin.billing.external.filter.independentShops')}</option>
                    </select>
                </div>
                <div className="flex flex-wrap gap-3 px-4 py-2 text-xs text-muted-foreground">
                    <span>{t('admin.billing.external.payers')}: {filteredExternalDocuments.length}</span>
                    <span>{t('admin.billing.external.deliveries')}: {filteredExternalDeliveries}</span>
                    <span>
                        {t('admin.billing.external.amountTtc')}: CHF {filteredExternalAmount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="table-scroll">
                    <Table className="min-w-[900px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('admin.billing.table.type')}</TableHead>
                            <TableHead>{t('admin.billing.table.payer')}</TableHead>
                            <TableHead className="text-right">{t('admin.billing.table.deliveries')}</TableHead>
                            <TableHead className="text-right">{t('admin.billing.table.amountTtc')}</TableHead>
                            <TableHead className="text-center">{t('admin.billing.table.status')}</TableHead>
                            <TableHead className="text-right">{t('admin.billing.table.action')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">{t('common.loading')}</TableCell>
                            </TableRow>
                        ) : filteredExternalDocuments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{t('admin.billing.noDataForMonth')}</TableCell>
                            </TableRow>
                        ) : (
                            filteredExternalDocuments.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Badge variant="outline">{recipientTypeLabels[row.recipient_type]}</Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{row.recipient_name}</TableCell>
                                    <TableCell className="text-right">{row.deliveries}</TableCell>
                                    <TableCell className="text-right">
                                        CHF {Number(row.amount_ttc).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline">{row.status || t('admin.billing.inProgress')}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleExport(row.recipient_type, row.recipient_id, row.recipient_name)}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDownloadPdf(row.id, row.recipient_name)}
                                            >
                                                <FileText className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                    </Table>
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <div className="px-4 py-3 border-b border-gray-200">
                    <div className="text-lg font-semibold">{t('admin.billing.internal.title')}</div>
                    <div className="text-sm text-muted-foreground">
                        {t('admin.billing.internal.subtitle')}
                    </div>
                </div>
                <div className="table-scroll">
                    <Table className="min-w-[900px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('admin.billing.table.association')}</TableHead>
                            <TableHead className="text-right">{t('admin.billing.table.deliveries')}</TableHead>
                            <TableHead className="text-right">{t('admin.billing.table.amountTtc')}</TableHead>
                            <TableHead className="text-center">{t('admin.billing.table.status')}</TableHead>
                            <TableHead className="text-right">{t('admin.billing.table.action')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">{t('common.loading')}</TableCell>
                            </TableRow>
                        ) : internalDocuments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">{t('admin.billing.noDataForMonth')}</TableCell>
                            </TableRow>
                        ) : (
                            internalDocuments.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium">{row.recipient_name}</TableCell>
                                    <TableCell className="text-right">{row.deliveries}</TableCell>
                                    <TableCell className="text-right">
                                        CHF {Number(row.amount_ttc).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline">{row.status || t('admin.billing.inProgress')}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleExport(row.recipient_type, row.recipient_id, row.recipient_name)}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDownloadPdf(row.id, row.recipient_name)}
                                            >
                                                <FileText className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                    </Table>
                </div>
            </div>

            <div className="rounded-md border bg-white p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <div className="text-lg font-semibold">{t('admin.billing.audit.title')}</div>
                        <div className="text-sm text-muted-foreground">
                            {t('admin.billing.audit.subtitle')}
                        </div>
                    </div>
                    <select
                        className="border rounded px-3 py-2 text-sm"
                        value={selectedRecipientKey}
                        onChange={(e) => setSelectedRecipientKey(e.target.value)}
                    >
                        <option value="all">
                            {externalFilter === 'COMMUNE'
                                        ? t('admin.billing.audit.recipients.allCities')
                                        : externalFilter === 'HQ'
                                            ? t('admin.billing.audit.recipients.allHq')
                                            : externalFilter === 'SHOP_INDEP'
                                                ? t('admin.billing.audit.recipients.allShops')
                                                : t('admin.billing.audit.recipients.allPayers')}
                        </option>
                        {filteredExternalDocuments.map((row) => (
                            <option key={row.id} value={`${row.recipient_type}:${row.recipient_id}`}>
                                {row.recipient_name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="table-scroll">
                    <Table className="min-w-[1100px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="whitespace-nowrap">{t('admin.billing.table.date')}</TableHead>
                            <TableHead className="min-w-[220px]">{t('admin.billing.table.payer')}</TableHead>
                            <TableHead className="min-w-[200px]">{t('admin.billing.table.shop')}</TableHead>
                            <TableHead className="min-w-[160px]">{t('admin.billing.table.client')}</TableHead>
                            <TableHead className="min-w-[220px]">{t('admin.billing.table.partnerCity')}</TableHead>
                            <TableHead className="text-right whitespace-nowrap min-w-[80px]">{t('admin.billing.table.bags')}</TableHead>
                            <TableHead className="text-right whitespace-nowrap min-w-[190px] pr-4">{t('admin.billing.table.amountDue')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {detailLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-20 text-center">{t('common.loading')}</TableCell>
                            </TableRow>
                        ) : visibleDetails.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                                    {t('admin.billing.audit.noDeliveries')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            visibleDetails.map((row) => {
                                const amountDue = Number(row.amount_due || 0)
                                const doc = documentById.get(row.document_id)
                                const payeurLabel = doc?.recipient_name ?? recipientTypeLabels[row.recipient_type] ?? row.recipient_type
                                return (
                                    <TableRow key={row.id}>
                                        <TableCell className="whitespace-nowrap">{new Date(row.delivery_date).toLocaleDateString(dateLocale)}</TableCell>
                                        <TableCell className="max-w-[260px] truncate" title={payeurLabel}>{payeurLabel}</TableCell>
                                        <TableCell className="max-w-[220px] truncate" title={row.shop_name || ''}>{row.shop_name || '-'}</TableCell>
                                        <TableCell className="max-w-[180px] truncate" title={row.client_name || ''}>{row.client_name || '-'}</TableCell>
                                        <TableCell className="max-w-[260px] truncate" title={row.commune_name || ''}>{row.commune_name || '-'}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap tabular-nums">{row.bags ?? '-'}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap tabular-nums font-semibold pr-4">
                                            CHF {amountDue.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
