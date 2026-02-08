'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Mail, Phone, MapPin, Store, Building2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { apiGet } from '@/lib/api'
import { useAuth } from '../../providers/AuthProvider'
import { toast } from 'sonner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ShopDialog, ShopData } from './components/ShopDialog'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type Shop = {
    id: string
    name: string
    city_id: string
    city_name: string
    hq_id?: string
    hq_name?: string
    tariff_version_id?: string
    address?: string
    contact_person?: string
    email?: string
    phone?: string
}

export default function ShopsPage() {
    const { session, adminContextRegion } = useAuth()
    const { t } = useLanguage()
    const [shops, setShops] = useState<Shop[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedShop, setSelectedShop] = useState<ShopData | null>(null)

    const loadShops = useCallback(async () => {
        setLoading(true)
        try {
            if (!session?.access_token) return

            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const data = await apiGet<Shop[]>(`/shops/admin${queryParams}`, session.access_token)
            setShops(data)
        } catch (error) {
            console.error('Failed to load shops', error)
            toast.error(t('admin.shops.toast.loadError'))
        } finally {
            setLoading(false)
        }
    }, [session, adminContextRegion])

    useEffect(() => {
        if (session?.access_token) {
            loadShops()
        }
    }, [session, loadShops])

    const handleCreate = () => {
        setSelectedShop(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (shop: Shop) => {
        setSelectedShop(shop)
        setIsDialogOpen(true)
    }

    const filteredShops = shops.filter(shop => {
        const query = searchQuery.toLowerCase()
        return (
            shop.name.toLowerCase().includes(query) ||
            shop.city_name?.toLowerCase().includes(query) ||
            shop.contact_person?.toLowerCase().includes(query)
        )
    })

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin.shops.title')}</h1>
                    <p className="text-gray-500 mt-1">
                        {shops.length} {t('admin.shops.subtitleCount')}
                    </p>
                </div>
                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('admin.shops.add')}
                </Button>
            </div>

            <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
                <Search className="w-4 h-4 text-gray-400 ml-2" />
                <Input
                    placeholder={t('admin.shops.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-none shadow-none focus-visible:ring-0"
                />
            </div>

            <div className="table-scroll bg-white rounded-lg border shadow-sm">
                <Table className="w-full table-fixed min-w-[980px]">
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[35%]">{t('admin.shops.table.shopLocation')}</TableHead>
                            <TableHead className="hidden lg:table-cell w-[30%]">{t('admin.shops.table.contact')}</TableHead>
                            <TableHead className="hidden lg:table-cell w-[25%]">{t('admin.shops.table.configuration')}</TableHead>
                            <TableHead className="w-[10%] text-right whitespace-nowrap">{t('admin.shops.table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-gray-500 animate-pulse">
                                    {t('admin.shops.table.loadingData')}
                                </TableCell>
                            </TableRow>
                        ) : filteredShops.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-gray-500">
                                    {t('admin.shops.table.empty')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredShops.map((shop) => (
                                <TableRow key={shop.id} className="hover:bg-gray-50/50 transition-colors">
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                                                <Store className="w-4 h-4 text-emerald-500" />
                                                {shop.name}
                                            </div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {shop.address ? (
                                                    <span title={shop.address} className="truncate max-w-[200px]">
                                                        {shop.address}, {shop.city_name}
                                                    </span>
                                                ) : (
                                                    <span>{shop.city_name}</span>
                                                )}
                                            </div>
                                            <div className="mt-2 space-y-2 text-xs text-gray-500 lg:hidden">
                                                {shop.contact_person && (
                                                    <div className="font-medium text-gray-700">{shop.contact_person}</div>
                                                )}
                                                {(shop.email || shop.phone) ? (
                                                    <div className="flex flex-wrap gap-3">
                                                        {shop.email && (
                                                            <div className="flex items-center gap-1" title={shop.email}>
                                                                <Mail className="w-3 h-3" />
                                                                <span className="truncate max-w-[160px]">{shop.email}</span>
                                                            </div>
                                                        )}
                                                        {shop.phone && (
                                                            <div className="flex items-center gap-1" title={shop.phone}>
                                                                <Phone className="w-3 h-3" />
                                                                <span>{shop.phone}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">{t('admin.shops.contactMissing')}</span>
                                                )}
                                                <div className="flex flex-wrap gap-2">
                                                    {shop.hq_name ? (
                                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                            <Building2 className="w-3 h-3 mr-1" />
                                                            {shop.hq_name}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs font-normal">{t('admin.shops.independent')}</Badge>
                                                    )}
                                                    {shop.tariff_version_id ? (
                                                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                                            {t('admin.shops.tariff.active')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                                            {t('admin.shops.tariff.missing')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                        <div className="text-sm space-y-1">
                                            {shop.contact_person && (
                                                <div className="font-medium text-gray-800">
                                                    {shop.contact_person}
                                                </div>
                                            )}
                                            {(shop.email || shop.phone) ? (
                                                <div className="flex gap-3 text-gray-500">
                                                    {shop.email && (
                                                        <div className="flex items-center gap-1" title={shop.email}>
                                                            <Mail className="w-3 h-3" />
                                                            <span className="text-xs truncate max-w-[120px]">{shop.email}</span>
                                                        </div>
                                                    )}
                                                    {shop.phone && (
                                                        <div className="flex items-center gap-1" title={shop.phone}>
                                                            <Phone className="w-3 h-3" />
                                                            <span className="text-xs">{shop.phone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">{t('admin.shops.contactMissing')}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                        <div className="flex flex-col gap-2 items-start">
                                            {shop.hq_name ? (
                                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                    <Building2 className="w-3 h-3 mr-1" />
                                                    {shop.hq_name}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="text-xs font-normal">{t('admin.shops.independent')}</Badge>
                                            )}

                                            {shop.tariff_version_id ? (
                                                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                                    {t('admin.shops.tariff.active')}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                                    {t('admin.shops.tariff.missing')}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Link href="/admin/dispatch" title={t('admin.shops.actions.viewDeliveries')}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-emerald-600">
                                                    <Store className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Link href="/admin/billing" title={t('admin.shops.actions.viewBilling')}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-green-600">
                                                    <Building2 className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEdit(shop)}
                                            >
                                                {t('common.edit')}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <ShopDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                shopToEdit={selectedShop}
                onSuccess={loadShops}
            />
        </div>
    )
}
