'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch' // Need to check if Switch exists, else Checkbox
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiPost, apiPut } from '@/lib/api'
import { useAuth } from '../../../providers/AuthProvider'
import { toast } from 'sonner'
import { Bike } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export type CourierData = {
    id?: string
    first_name: string
    last_name: string
    courier_number: string
    email?: string | null
    phone_number?: string | null
    vehicle_type?: string | null
    active: boolean
    can_dispatch?: boolean
}

type CourierDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    courierToEdit?: CourierData | null
    onSuccess: () => void
}

const normalizeChPhoneNumber = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const digits = trimmed.replace(/\D/g, '')
    if (!digits) return ''
    if (trimmed.startsWith('+')) {
        return `+${digits}`
    }
    if (digits.startsWith('41')) {
        return `+${digits}`
    }
    if (digits.startsWith('0') && digits.length === 10) {
        return `+41${digits.slice(1)}`
    }
    return trimmed
}

export function CourierDialog({ open, onOpenChange, courierToEdit, onSuccess }: CourierDialogProps) {
    const { t } = useLanguage()
    const { session, user, adminContextRegion } = useAuth()
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState<CourierData>({
        first_name: '',
        last_name: '',
        courier_number: '',
        email: '',
        phone_number: '',
        vehicle_type: 'bike',
        active: true,
        can_dispatch: false,
    })

    useEffect(() => {
        if (courierToEdit) {
            setFormData({
                ...courierToEdit,
                email: courierToEdit.email || '',
                phone_number: courierToEdit.phone_number || '',
                vehicle_type: courierToEdit.vehicle_type || 'bike',
                can_dispatch: courierToEdit.can_dispatch ?? false,
            })
        } else {
            setFormData({
                first_name: '',
                last_name: '',
                courier_number: '',
                email: '',
                phone_number: '',
                vehicle_type: 'bike',
                active: true,
                can_dispatch: false,
            })
        }
    }, [courierToEdit, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!session?.access_token) return
        if (user?.role === 'super_admin' && !adminContextRegion?.id) {
            toast.error(t('admin.couriers.dialog.selectRegion'))
            return
        }

        const editing = !!courierToEdit?.id
        const normalizedPhone = normalizeChPhoneNumber(formData.phone_number || '')
        if (!editing && !normalizedPhone) {
            toast.error(t('admin.couriers.dialog.phoneRequired'))
            return
        }
        if (normalizedPhone && !normalizedPhone.startsWith('+41')) {
            toast.error(t('admin.couriers.dialog.phoneMustStart'))
            return
        }

        setLoading(true)
        try {
            const payload = {
                ...formData,
                phone_number: normalizedPhone || null,
                admin_region_id: user?.role === 'super_admin' ? adminContextRegion?.id : undefined,
            }

            if (courierToEdit?.id) {
                await apiPut(`/couriers/${courierToEdit.id}`, payload, session.access_token)
                toast.success(t('admin.couriers.dialog.updated'))
            } else {
                await apiPost('/couriers', payload, session.access_token)
                toast.success(t('admin.couriers.dialog.created'))
            }
            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            console.error(error)
            toast.error(getErrorMessage(error, t('admin.couriers.dialog.unknownError')))
        } finally {
            setLoading(false)
        }
    }

    const isEditing = !!courierToEdit?.id

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t('admin.couriers.dialog.editTitle') : t('admin.couriers.dialog.newTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('admin.couriers.dialog.description')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstname">{t('admin.couriers.dialog.firstName')} *</Label>
                            <Input
                                id="firstname"
                                value={formData.first_name}
                                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastname">{t('admin.couriers.dialog.lastName')} *</Label>
                            <Input
                                id="lastname"
                                value={formData.last_name}
                                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="matricule">{t('admin.couriers.dialog.number')} *</Label>
                        <Input
                            id="matricule"
                            value={formData.courier_number}
                            onChange={e => setFormData({ ...formData, courier_number: e.target.value })}
                            placeholder={t('admin.couriers.dialog.numberPlaceholder')}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">{t('settings.profile.email')}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email || ''}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">{t('admin.couriers.dialog.phone')}</Label>
                            <Input
                                id="phone"
                                type="tel"
                                inputMode="tel"
                                value={formData.phone_number || ''}
                                onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                onBlur={() => {
                                    const normalized = normalizeChPhoneNumber(formData.phone_number || '')
                                    if (normalized && normalized !== formData.phone_number) {
                                        setFormData({ ...formData, phone_number: normalized })
                                    }
                                }}
                                placeholder="+41 79 123 45 67"
                                required={!isEditing}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="vehicle">{t('admin.couriers.dialog.vehicle')}</Label>
                        <Select
                            value={formData.vehicle_type || 'bike'}
                            onValueChange={v => setFormData({ ...formData, vehicle_type: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bike">
                                    <div className="flex items-center"><Bike className="w-4 h-4 mr-2" /> {t('admin.couriers.dialog.vehicleBike')}</div>
                                </SelectItem>
                                <SelectItem value="cargo">
                                    <div className="flex items-center"><Bike className="w-4 h-4 mr-2" /> {t('admin.couriers.dialog.vehicleCargo')}</div>
                                </SelectItem>
                                <SelectItem value="electric">
                                    <div className="flex items-center"><Bike className="w-4 h-4 mr-2 text-emerald-500" /> {t('admin.couriers.dialog.vehicleElectric')}</div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3 bg-gray-50 p-3 rounded">
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="active"
                                checked={formData.active}
                                onCheckedChange={(c) => setFormData({ ...formData, active: c })}
                            />
                            <Label htmlFor="active" className="cursor-pointer">{t('admin.couriers.dialog.active')}</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="can_dispatch"
                                checked={!!formData.can_dispatch}
                                onCheckedChange={(c) => setFormData({ ...formData, can_dispatch: c })}
                            />
                            <Label htmlFor="can_dispatch" className="cursor-pointer">{t('admin.couriers.dialog.canDispatch')}</Label>
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? t('admin.couriers.dialog.saving') : (isEditing ? t('admin.couriers.dialog.update') : t('admin.couriers.dialog.create'))}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
