'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ShoppingBag, CreditCard, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiDelete } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { TariffDialog } from './components/TariffDialog'
import * as Sentry from '@sentry/browser'

interface TariffGrid {
    id: string
    name: string
    current_version_id: string
    rule_type: string
    rule: Record<string, unknown> | null
    share: Record<string, unknown> | null
}

export default function TariffsPage() {
    const { user, adminContextRegion } = useAuth()
    const { t } = useLanguage()
    const [tariffs, setTariffs] = useState<TariffGrid[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedTariff, setSelectedTariff] = useState<TariffGrid | null>(null)

    const loadData = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            setLoading(true)
            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const data = await apiGet<TariffGrid[]>(`/tariffs${queryParams}`, session.access_token)
            setTariffs(data)
        } catch (error) {
            console.error(t('admin.tariffs.loadError'), error)
            Sentry.captureException(error)
            toast.error(t('admin.tariffs.loadError'))
        } finally {
            setLoading(false)
        }
    }, [adminContextRegion, t])

    useEffect(() => {
        loadData()
    }, [user, loadData])

    const handleCreate = () => {
        setSelectedTariff(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (tariff: TariffGrid) => {
        setSelectedTariff(tariff)
        setIsDialogOpen(true)
    }

    const handleDelete = async (tariff: TariffGrid) => {
        const confirmed = window.confirm(t('admin.tariffs.deleteConfirm', { name: tariff.name }))
        if (!confirmed) return

        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            await apiDelete(`/tariffs/${tariff.id}`, session.access_token)
            toast.success(t('admin.tariffs.deleteSuccess'))
            loadData()
        } catch (error: unknown) {
            console.error(t('admin.tariffs.deleteError'), error)
            Sentry.captureException(error)
            const message =
                error && typeof error === 'object' && 'message' in error
                    ? String(error.message)
                    : t('admin.tariffs.deleteError')
            toast.error(message)
        }
    }

    const formatRule = (tariff: TariffGrid) => {
        const rule = tariff.rule ?? {}
        const pricingValue = rule.pricing
        const pricing =
            pricingValue && typeof pricingValue === 'object'
                ? (pricingValue as Record<string, unknown>)
                : rule
        if (tariff.rule_type === 'bags_price' || tariff.rule_type === 'bags') {
            const priceRaw = pricing.price_per_2_bags ?? pricing.price_per_bag ?? pricing.amount_per_bag
            const price = priceRaw === undefined || priceRaw === null ? null : Number(priceRaw)
            return Number.isFinite(price) && price !== null
                ? t('admin.tariffs.rule.bagsPrice', { price })
                : t('admin.tariffs.na')
        }
        if (tariff.rule_type === 'order_amount') {
            const thresholds = Array.isArray(pricing.thresholds) ? pricing.thresholds : []
            const count = thresholds.length
            if (count > 0) {
                return t('admin.tariffs.rule.thresholdsCount', { count })
            }
            if (pricing.percent_of_order !== undefined) {
                return t('admin.tariffs.rule.percentOfOrder', { percent: Number(pricing.percent_of_order ?? 0) })
            }
            return t('admin.tariffs.na')
        }
        return t('admin.tariffs.na')
    }

    const formatShare = (share: Record<string, unknown> | null) => {
        if (!share) return '-'
        const client = Number(share.client ?? 0)
        const shop = Number(share.shop ?? 0)
        const city = Number(share.city ?? 0)
        const admin = Number(share.admin_region ?? share.velocite ?? 0)
        if (client === 100) return t('admin.tariffs.share.client100')
        if (shop === 100) return t('admin.tariffs.share.shop100')
        return t('admin.tariffs.share.full', { client, shop, city, admin })
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin.tariffs.title')}</h1>
                    <p className="text-gray-500 mt-1">
                        {t('admin.tariffs.subtitle')}
                    </p>
                </div>
                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('admin.tariffs.new')}
                </Button>
            </div>

            <div className="table-scroll bg-white rounded-lg border shadow-sm">
                <Table className="min-w-[800px]">
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[300px]">{t('admin.tariffs.gridName')}</TableHead>
                            <TableHead>{t('admin.tariffs.calcType')}</TableHead>
                            <TableHead>{t('admin.tariffs.ruleDetail')}</TableHead>
                            <TableHead>{t('admin.tariffs.shareLabel')}</TableHead>
                            <TableHead className="text-right">{t('admin.tariffs.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="h-32 text-center animate-pulse text-gray-400">{t('common.loading')}</TableCell></TableRow>
                        ) : tariffs.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{t('admin.tariffs.empty')}</TableCell></TableRow>
                        ) : (
                            tariffs.map((tariff) => (
                                <TableRow key={tariff.id} className="hover:bg-gray-50/50 transition-colors">
                                    <TableCell className="font-medium text-gray-900">
                                        {tariff.name}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {tariff.rule_type === 'bags_price' ?
                                                <ShoppingBag className="w-4 h-4 text-emerald-500" /> :
                                                <CreditCard className="w-4 h-4 text-green-500" />
                                            }
                                            <span className="capitalize">{tariff.rule_type === 'bags_price' ? t('admin.tariffs.type.bags') : t('admin.tariffs.type.orderAmount')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-gray-600">
                                        {formatRule(tariff)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-normal text-gray-600 bg-gray-50">
                                            {formatShare(tariff.share)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(tariff)}
                                        >
                                            {t('common.edit')}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-600 hover:text-red-700"
                                            onClick={() => handleDelete(tariff)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <TariffDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                tariffToEdit={selectedTariff}
                onSuccess={loadData}
            />
        </div>
    )
}
