'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Bike, Zap, Phone, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Input } from "@/components/ui/input"
import { Badge } from '@/components/ui/badge'
import { CourierDialog, CourierData } from './components/CourierDialog'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'

interface Courier {
    id: string
    first_name: string
    last_name: string
    courier_number: string
    phone_number?: string
    email?: string
    active: boolean
    vehicle_type?: string
    admin_region_name?: string
}

export default function AdminCouriersPage() {
    const { t } = useLanguage()
    const { user, adminContextRegion } = useAuth()
    const [couriers, setCouriers] = useState<Courier[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedCourier, setSelectedCourier] = useState<CourierData | null>(null)

    const loadData = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const token = session.access_token

            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const couriersData = await apiGet<Courier[]>(`/couriers${queryParams}`, token)

            setCouriers(couriersData)
        } catch (error) {
            captureError(error, 'AdminCouriersPage.loadData')
            toast.error(t('admin.couriers.errorLoad'))
        } finally {
            setLoading(false)
        }
    }, [adminContextRegion, t])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleCreate = () => {
        setSelectedCourier(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (courier: Courier) => {
        setSelectedCourier(courier)
        setIsDialogOpen(true)
    }

    // Determine if user is super_admin (and no context is set)
    const isSuperAdmin = user?.role === 'super_admin' && !adminContextRegion

    const filteredCouriers = couriers.filter(c =>
        c.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.courier_number.includes(searchTerm) ||
        (c.admin_region_name && c.admin_region_name.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin.couriers.title')}</h1>
                    <p className="text-gray-500 mt-1">
                        {isSuperAdmin ? t('admin.couriers.subtitleSuper') : `${couriers.length} ${t('admin.couriers.subtitleRegion')}`}
                    </p>
                </div>

                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('admin.couriers.new')}
                </Button>
            </div>

            <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
                <Search className="w-4 h-4 text-gray-400 ml-2" />
                <Input
                    type="search"
                    placeholder={isSuperAdmin ? t('admin.couriers.searchPlaceholderSuper') : t('admin.couriers.searchPlaceholder')}
                    className="border-none shadow-none focus-visible:ring-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="table-scroll bg-white rounded-lg border shadow-sm">
                <Table className="w-full table-fixed min-w-[980px]">
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[9%] whitespace-nowrap">{t('admin.couriers.table.number')}</TableHead>
                            <TableHead className="w-[19%]">{t('admin.couriers.table.identity')}</TableHead>
                            {isSuperAdmin && <TableHead>{t('admin.couriers.table.region')}</TableHead>}
                            <TableHead className={isSuperAdmin ? 'w-[20%]' : 'w-[30%]'}>{t('admin.couriers.table.contact')}</TableHead>
                            <TableHead className={isSuperAdmin ? 'w-[14%]' : 'w-[18%]'}>{t('admin.couriers.table.vehicle')}</TableHead>
                            <TableHead className={isSuperAdmin ? 'w-[14%]' : 'w-[14%]'}>{t('admin.couriers.table.status')}</TableHead>
                            <TableHead className={isSuperAdmin ? 'w-[12%] text-right whitespace-nowrap' : 'w-[10%] text-right whitespace-nowrap'}>{t('admin.couriers.table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center h-32 animate-pulse text-gray-400">{t('common.loading')}</TableCell></TableRow>
                        ) : filteredCouriers.length === 0 ? (
                            <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center h-32 text-muted-foreground">{t('admin.couriers.empty')}</TableCell></TableRow>
                        ) : (
                            filteredCouriers.map(courier => (
                                <TableRow key={courier.id} className="hover:bg-gray-50/50 transition-colors">
                                    <TableCell className="font-mono font-medium text-xs text-gray-500">{courier.courier_number}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 font-medium text-gray-900">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                                                {(courier.first_name[0] || '').toUpperCase()}{(courier.last_name[0] || '').toUpperCase()}
                                            </div>
                                            {courier.first_name} {courier.last_name}
                                        </div>
                                    </TableCell>
                                    {isSuperAdmin && <TableCell><Badge variant="outline">{courier.admin_region_name}</Badge></TableCell>}
                                    <TableCell>
                                        <div className="flex flex-col gap-1 text-sm text-gray-500">
                                            {courier.phone_number && (
                                                <div className="flex items-center gap-1">
                                                    <Phone className="w-3 h-3" /> {courier.phone_number}
                                                </div>
                                            )}
                                            {courier.email && (
                                                <div className="flex items-center gap-1">
                                                    <Mail className="w-3 h-3" />
                                                    <span className="truncate max-w-[150px]">{courier.email}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {courier.vehicle_type === 'cargo' && (
                                            <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200 gap-1">
                                                <Bike className="w-3 h-3" /> {t('admin.couriers.vehicle.cargo')}
                                            </Badge>
                                        )}
                                        {courier.vehicle_type === 'electric' && (
                                            <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200 gap-1">
                                                <Zap className="w-3 h-3" /> {t('admin.couriers.vehicle.electric')}
                                            </Badge>
                                        )}
                                        {(courier.vehicle_type === 'bike' || !courier.vehicle_type) && (
                                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                                <Bike className="w-3 h-3" /> {t('admin.couriers.vehicle.bike')}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${courier.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${courier.active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                            {courier.active ? t('admin.couriers.status.active') : t('admin.couriers.status.inactive')}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(courier)}
                                        >
                                            {t('common.edit')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <CourierDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                courierToEdit={selectedCourier}
                onSuccess={loadData}
            />
        </div>
    )
}
