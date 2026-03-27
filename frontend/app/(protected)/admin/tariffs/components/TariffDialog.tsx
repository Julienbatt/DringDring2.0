'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Info, Plus, Trash2, CreditCard } from "lucide-react"
import { apiPost, apiPut } from '@/lib/api'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'

interface TariffDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    tariffToEdit: TariffEditData | null
    onSuccess: () => void
}

type TariffThreshold = {
    min: number
    max: number | null
    price: number
}

type TariffShare = {
    client?: number
    shop?: number
    city?: number
    admin_region?: number
    velocite?: number
}

type TariffPricing = {
    price_per_2_bags?: number
    price_per_bag?: number
    amount_per_bag?: number
    cms_price_per_2_bags?: number
    thresholds?: TariffThreshold[]
}

type TariffRule = {
    pricing?: TariffPricing
    price_per_2_bags?: number
    price_per_bag?: number
    amount_per_bag?: number
    cms_price_per_2_bags?: number
    thresholds?: TariffThreshold[]
    shares_cms?: {
        client: number
        shop: number
        city: number
        admin_region: number
    }
}

export type TariffEditData = {
    id: string
    name: string
    rule_type: string
    rule?: TariffRule | Record<string, unknown> | null
    share?: TariffShare | Record<string, unknown> | null
}

export function TariffDialog({ open, onOpenChange, tariffToEdit, onSuccess }: TariffDialogProps) {
    const { user, adminContextRegion } = useAuth()
    const { t } = useLanguage()
    const [name, setName] = useState('')
    const [ruleType, setRuleType] = useState('bags_price')
    const [bagPrice, setBagPrice] = useState('5.00')
    const [cmsPrice, setCmsPrice] = useState('')
    const [cmsShareMode, setCmsShareMode] = useState<'same' | 'city_shop_50'>('same')
    const [thresholds, setThresholds] = useState<{ min: string, max: string, price: string }[]>([
        { min: '0', max: '50', price: '12.00' },
        { min: '50', max: '', price: '8.00' }
    ])

    const [payerType, setPayerType] = useState('client')
    const [clientSharePercent, setClientSharePercent] = useState('50')
    const [loading, setLoading] = useState(false)

    // Load Data
    useEffect(() => {
        if (tariffToEdit) {
            setName(tariffToEdit.name)
            const normalizedRuleType = tariffToEdit.rule_type === 'bags' ? 'bags_price' : tariffToEdit.rule_type
            setRuleType(normalizedRuleType)

            // Map Config
            if (normalizedRuleType === 'bags_price') {
                const rule = (tariffToEdit.rule ?? {}) as TariffRule
                const pricing = (rule.pricing ?? rule) as TariffPricing
                const priceValue = pricing.price_per_2_bags ?? pricing.price_per_bag ?? pricing.amount_per_bag ?? '5.00'
                setBagPrice(String(priceValue))
                setCmsPrice(pricing.cms_price_per_2_bags ? String(pricing.cms_price_per_2_bags) : '')
                if (rule.shares_cms?.shop === 50 && rule.shares_cms?.city === 50) {
                    setCmsShareMode('city_shop_50')
                } else {
                    setCmsShareMode('same')
                }
            } else {
                // Map thresholds
                const rule = (tariffToEdit.rule ?? {}) as TariffRule
                const pricing = (rule.pricing ?? rule) as TariffPricing
                const th = Array.isArray(pricing.thresholds) ? pricing.thresholds : []
                setThresholds(th.map((threshold: TariffThreshold) => ({
                    min: String(threshold.min),
                    max: threshold.max ? String(threshold.max) : '',
                    price: String(threshold.price)
                })))
            }

            // Map Shares
            const share = (tariffToEdit.share ?? {}) as TariffShare
            if (tariffToEdit.share) {
                if (Number(share.client ?? 0) === 100) setPayerType('client')
                else if (Number(share.shop ?? 0) === 100) setPayerType('shop')
                else if (Math.abs(Number(share.shop ?? 0) - 33.33) < 1) setPayerType('equal_3')
                else {
                    setPayerType('shared')
                    setClientSharePercent(String(share.client ?? '50'))
                }
            }

        } else {
            setName('')
            setRuleType('bags_price')
            setBagPrice('5.00')
            setCmsPrice('')
            setCmsShareMode('same')
            setThresholds([
                { min: '0', max: '50', price: '12.00' },
                { min: '50', max: '', price: '8.00' }
            ])
            setPayerType('client')
        }
    }, [tariffToEdit, open])

    const addThreshold = () => {
        setThresholds([...thresholds, { min: '', max: '', price: '' }])
    }

    const removeThreshold = (index: number) => {
        setThresholds(thresholds.filter((_, i) => i !== index))
    }

    const updateThreshold = (index: number, field: 'min' | 'max' | 'price', value: string) => {
        const newThresholds = [...thresholds]
        newThresholds[index][field] = value
        setThresholds(newThresholds)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.access_token) {
            toast.error(t('admin.tariffs.dialog.sessionExpired'))
            return
        }
        if (user?.role === 'super_admin' && !adminContextRegion?.id) {
            toast.error(t('admin.tariffs.dialog.selectRegion'))
            return
        }

        setLoading(true)
        try {
            // Construct JSON Rule
            let rulePayload: TariffRule = {}
            if (ruleType === 'bags_price') {
                rulePayload = {
                    pricing: {
                        price_per_2_bags: parseFloat(bagPrice),
                    }
                }
                if (cmsPrice) {
                    if (!rulePayload.pricing) rulePayload.pricing = {}
                    rulePayload.pricing.cms_price_per_2_bags = parseFloat(cmsPrice)
                }
            } else {
                // order_amount - threshold_list
                rulePayload = {
                    pricing: {
                        thresholds: thresholds.map((threshold) => ({
                            min: parseFloat(threshold.min || '0'),
                            max: threshold.max ? parseFloat(threshold.max) : null,
                            price: parseFloat(threshold.price || '0')
                        }))
                    }
                }
            }

            // Construct JSON Share
            let sharePayload: { client: number; shop: number; city: number; admin_region: number }
            if (payerType === 'client') {
                sharePayload = { client: 100, shop: 0, city: 0, admin_region: 0 }
            } else if (payerType === 'shop') {
                sharePayload = { client: 0, shop: 100, city: 0, admin_region: 0 }
            } else if (payerType === 'equal_3') {
                // 33.33 each
                sharePayload = { client: 33.33, shop: 33.33, city: 33.34, admin_region: 0 }
            } else {
                // Custom or old shared logic (Client vs Shop)
                const clientPct = parseFloat(clientSharePercent)
                sharePayload = { client: clientPct, shop: 100 - clientPct, city: 0, admin_region: 0 }
            }

            const backendRuleType = ruleType === 'bags_price' ? 'bags' : ruleType
            const payload: {
                name: string
                rule_type: string
                rule: TariffRule
                share: { client: number; shop: number; city: number; admin_region: number }
                admin_region_id?: string
            } = {
                name,
                rule_type: backendRuleType,
                rule: rulePayload,
                share: sharePayload
            }
            if (cmsShareMode === 'city_shop_50') {
                payload.rule.shares_cms = { client: 0, shop: 50, city: 50, admin_region: 0 }
            }
            if (user?.role === 'super_admin' && adminContextRegion?.id) {
                payload.admin_region_id = adminContextRegion.id
            }

            if (tariffToEdit) {
                await apiPut(`/tariffs/${tariffToEdit.id}`, payload, session.access_token)
                toast.success(t('admin.tariffs.dialog.updated'))
            } else {
                await apiPost('/tariffs', payload, session.access_token)
                toast.success(t('admin.tariffs.dialog.created'))
            }

            onSuccess()
            onOpenChange(false)
        } catch (error) {
            captureError(error, 'TariffDialog.handleSubmit')
            toast.error(t('admin.tariffs.dialog.saveError'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{tariffToEdit ? t('admin.tariffs.dialog.editTitle') : t('admin.tariffs.dialog.newTitle')}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label>{t('admin.tariffs.dialog.gridName')}</Label>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('admin.tariffs.dialog.gridNamePlaceholder')}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>{t('admin.tariffs.dialog.ruleType')}</Label>
                        <Select value={ruleType} onValueChange={setRuleType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bags_price">{t('admin.tariffs.dialog.ruleTypeBags')}</SelectItem>
                                <SelectItem value="order_amount">{t('admin.tariffs.dialog.ruleTypeOrder')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Rule Config Area */}
                    <div className="space-y-4 border p-4 rounded-md bg-gray-50/50">
                        <h3 className="font-medium flex items-center gap-2">
                            <Info className="w-4 h-4 text-emerald-500" />
                            {t('admin.tariffs.dialog.pricingConfig')}
                        </h3>

                        {ruleType === 'bags_price' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t('admin.tariffs.dialog.price2Bags')}</Label>
                                    <Input
                                        type="number" step="0.05"
                                        value={bagPrice}
                                        onChange={e => setBagPrice(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('admin.tariffs.dialog.cmsPrice2Bags')}</Label>
                                    <Input
                                        type="number" step="0.05"
                                        value={cmsPrice}
                                        onChange={e => setCmsPrice(e.target.value)}
                                        placeholder={t('admin.tariffs.dialog.optional')}
                                    />
                                    <p className="text-xs text-muted-foreground">{t('admin.tariffs.dialog.cmsPriceHint')}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>{t('admin.tariffs.dialog.thresholds')}</Label>
                                    <Button type="button" variant="outline" size="sm" onClick={addThreshold}>
                                        <Plus className="w-4 h-4 mr-2" />
                                        {t('admin.tariffs.dialog.addThreshold')}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {thresholds.map((threshold, i) => (
                                        <div key={i} className="flex gap-2 items-end">
                                            <div className="w-24">
                                                <Label className="text-xs">{t('admin.tariffs.dialog.min')}</Label>
                                                <Input
                                                    type="number"
                                                    value={threshold.min}
                                                    onChange={e => updateThreshold(i, 'min', e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <Label className="text-xs">{t('admin.tariffs.dialog.max')}</Label>
                                                <Input
                                                    type="number"
                                                    value={threshold.max}
                                                    onChange={e => updateThreshold(i, 'max', e.target.value)}
                                                    placeholder={t('admin.tariffs.dialog.infinite')}
                                                />
                                            </div>
                                            <div className="w-24">
                                                <Label className="text-xs">{t('admin.tariffs.dialog.price')}</Label>
                                                <Input
                                                    type="number"
                                                    value={threshold.price}
                                                    onChange={e => updateThreshold(i, 'price', e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <Button
                                                type="button" variant="ghost" size="icon"
                                                onClick={() => removeThreshold(i)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Share Config Area */}
                    <div className="space-y-4 border p-4 rounded-md bg-gray-50/50">
                        <h3 className="font-medium flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-green-500" />
                            {t('admin.tariffs.dialog.shareConfig')}
                        </h3>

                        <div className="space-y-4">
                            <Select value={payerType} onValueChange={setPayerType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="client">{t('admin.tariffs.dialog.payerClient')}</SelectItem>
                                    <SelectItem value="shop">{t('admin.tariffs.dialog.payerShop')}</SelectItem>
                                    <SelectItem value="equal_3">{t('admin.tariffs.dialog.payerEqual')}</SelectItem>
                                    <SelectItem value="shared">{t('admin.tariffs.dialog.payerShared')}</SelectItem>
                                </SelectContent>
                            </Select>

                            {payerType === 'shared' && (
                                <div className="space-y-2 pl-4 border-l-2 border-emerald-200">
                                    <Label>{t('admin.tariffs.dialog.clientShare')}</Label>
                                    <div className="flex items-center gap-4">
                                        <Input
                                            type="number" min="0" max="100"
                                            value={clientSharePercent}
                                            onChange={e => setClientSharePercent(e.target.value)}
                                            className="w-24"
                                        />
                                        <span className="text-sm text-gray-500">
                                            {t('admin.tariffs.dialog.shopPays', { percent: 100 - parseFloat(clientSharePercent || '0') })}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {ruleType === 'bags_price' && (
                                <div className="space-y-2 pl-4 border-l-2 border-amber-200">
                                    <Label>{t('admin.tariffs.dialog.cmsShare')}</Label>
                                    <Select
                                        value={cmsShareMode}
                                        onValueChange={(v) =>
                                            setCmsShareMode(v === 'city_shop_50' ? 'city_shop_50' : 'same')
                                        }
                                    >
                                        <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                            <SelectItem value="same">{t('admin.tariffs.dialog.cmsShareSame')}</SelectItem>
                                            <SelectItem value="city_shop_50">{t('admin.tariffs.dialog.cmsShareCityShop')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? t('admin.tariffs.dialog.saving') : t('admin.tariffs.dialog.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
