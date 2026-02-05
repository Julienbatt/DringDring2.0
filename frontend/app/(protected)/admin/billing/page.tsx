'use client'

import { useState, useEffect, useRef } from 'react'
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

const recipientTypeLabels = {
    COMMUNE: 'Commune',
    HQ: 'HQ',
    SHOP_INDEP: 'Commerce independant',
    INTERNAL: 'Interne',
} as const

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

function getCurrentMonth() {
    const now = new Date()
    now.setMonth(now.getMonth() - 1)
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${now.getFullYear()}-${month}`
}

export default function BillingPage() {
    const { adminContextRegion, user } = useAuth()
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
        setData(null)
        setDetails([])
        loadAll()
    }, [selectedMonth, adminContextRegion])

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


    const loadAll = async () => {
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
            toast.error('Erreur lors du chargement des donnees')
        } finally {
            if (requestId === loadAllRequestRef.current) {
                setLoading(false)
                setDetailLoading(false)
            }
        }
    }

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
            toast.success('Facturation recalculee')
        } catch (error) {
            console.error('Refresh failed', error)
            toast.error('Erreur lors du recalcul')
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
            toast.error("Erreur lors de l'export")
        }
    }

    const downloadZip = async (recipientType: 'COMMUNE' | 'HQ' | 'SHOP_INDEP', filename: string) => {
        try {
            if (!userIsRegional()) {
                toast.error('Selectionnez une entreprise regionale')
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
                    toast.info('Aucun document pour cette periode')
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
            toast.error('Erreur lors du telechargement ZIP')
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
            toast.error('Erreur lors du telechargement')
        }
    }

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
            toast.info('Aucun document interne pour cette periode.')
            return
        }
        handleDownloadPdf(internalDoc.id, internalDoc.recipient_name)
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Facturation regionale</h1>
                    <p className="text-muted-foreground">Gestion des clotures mensuelles</p>
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
                                    <div className="absolute z-20 mt-2 w-[260px] rounded-xl border bg-white p-3 shadow-lg">
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
                                Mode preview (sans gel)
                            </label>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleRefresh}
                            disabled={loading || refreshing}
                            variant="default"
                        >
                            {refreshing ? 'Recalcul...' : 'Recalculer la facturation'}
                        </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" onClick={handleInternalPdf}>
                                <FileText className="mr-2 h-4 w-4" />
                                PDF Interne
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadZip('HQ', `factures-hq-${selectedMonth}.zip`)}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                PDF HQ
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadZip('COMMUNE', `factures-communes-${selectedMonth}.zip`)}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                PDF Communes & zones
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadZip('SHOP_INDEP', `factures-commerces-${selectedMonth}.zip`)}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                PDF Commerces independants
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="text-sm font-medium text-muted-foreground">Total facture TTC (periode)</div>
                    <div className="text-2xl font-bold">
                        CHF {totalBilledTtc.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="text-sm font-medium text-muted-foreground">
                        TVA {(vatRateValue * 100).toFixed(1)}%
                    </div>
                    <div className="text-2xl font-bold">
                        CHF {totalBilledVat.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="text-sm font-medium text-muted-foreground">Total HT (periode)</div>
                    <div className="text-2xl font-bold">
                        CHF {totalBilledHt.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
                    <div>
                        <div className="text-lg font-semibold">Factures externes</div>
                        <div className="text-sm text-muted-foreground">
                            Communes, HQ et commerces independants. Chaque payeur recoit sa facture.
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
                        <option value="ALL">Tous les payeurs externes</option>
                        <option value="COMMUNE">Communes & zones</option>
                        <option value="HQ">HQ</option>
                        <option value="SHOP_INDEP">Commerces independants</option>
                    </select>
                </div>
                <div className="flex flex-wrap gap-3 px-4 py-2 text-xs text-muted-foreground">
                    <span>Payeurs: {filteredExternalDocuments.length}</span>
                    <span>Livraisons: {filteredExternalDeliveries}</span>
                    <span>
                        Montant TTC: CHF {filteredExternalAmount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="table-scroll">
                    <Table className="min-w-[900px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Payeur</TableHead>
                            <TableHead className="text-right">Livraisons</TableHead>
                            <TableHead className="text-right">Montant facture (TTC)</TableHead>
                            <TableHead className="text-center">Statut</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">Chargement...</TableCell>
                            </TableRow>
                        ) : filteredExternalDocuments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Aucune donnee pour ce mois.</TableCell>
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
                                        <Badge variant="outline">En cours</Badge>
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
                    <div className="text-lg font-semibold">Facture interne</div>
                    <div className="text-sm text-muted-foreground">
                        Facture globale pour l&apos;association regionale (montant total des livraisons).
                    </div>
                </div>
                <div className="table-scroll">
                    <Table className="min-w-[900px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Association</TableHead>
                            <TableHead className="text-right">Livraisons</TableHead>
                            <TableHead className="text-right">Montant facture (TTC)</TableHead>
                            <TableHead className="text-center">Statut</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">Chargement...</TableCell>
                            </TableRow>
                        ) : internalDocuments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Aucune donnee pour ce mois.</TableCell>
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
                                        <Badge variant="outline">En cours</Badge>
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
                        <div className="text-lg font-semibold">Audit des livraisons (factures externes)</div>
                        <div className="text-sm text-muted-foreground">
                            Liste des lignes de facturation. Une livraison peut apparaitre plusieurs fois (1 par payeur).
                        </div>
                    </div>
                    <select
                        className="border rounded px-3 py-2 text-sm"
                        value={selectedRecipientKey}
                        onChange={(e) => setSelectedRecipientKey(e.target.value)}
                    >
                        <option value="all">
                            {externalFilter === 'COMMUNE'
                                ? 'Toutes les communes'
                                : externalFilter === 'HQ'
                                    ? 'Tous les HQ'
                                    : externalFilter === 'SHOP_INDEP'
                                        ? 'Tous les commerces'
                                        : 'Tous les payeurs'}
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
                            <TableHead className="whitespace-nowrap">Date</TableHead>
                            <TableHead className="min-w-[220px]">Payeur</TableHead>
                            <TableHead className="min-w-[200px]">Commerce</TableHead>
                            <TableHead className="min-w-[160px]">Client</TableHead>
                            <TableHead className="min-w-[220px]">Commune partenaire</TableHead>
                            <TableHead className="text-right whitespace-nowrap min-w-[80px]">Sacs</TableHead>
                            <TableHead className="text-right whitespace-nowrap min-w-[190px] pr-4">Montant a facturer (CHF)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {detailLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-20 text-center">Chargement...</TableCell>
                            </TableRow>
                        ) : visibleDetails.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                                    Aucune livraison pour cette periode.
                                </TableCell>
                            </TableRow>
                        ) : (
                            visibleDetails.map((row) => {
                                const amountDue = Number(row.amount_due || 0)
                                const doc = documentById.get(row.document_id)
                                const payeurLabel = doc?.recipient_name ?? recipientTypeLabels[row.recipient_type] ?? row.recipient_type
                                return (
                                    <TableRow key={row.id}>
                                        <TableCell className="whitespace-nowrap">{new Date(row.delivery_date).toLocaleDateString('fr-CH')}</TableCell>
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
