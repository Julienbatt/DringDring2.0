'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPut } from '@/lib/api'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { roleLabel } from '@/lib/roleLabel'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type UserData = {
    id: string
    email: string
    role: string
    shop_id?: string
    city_id?: string
    admin_region_id?: string
    hq_id?: string
    last_sign_in_at?: string
    created_at?: string
}

type UserUpdatePayload = {
    role: string
    admin_region_id: string | null
    shop_id: string | null
    city_id: string | null
    hq_id: string | null
}

export default function SuperAdminUsersPage() {
    const { t, locale } = useLanguage()
    const { session } = useAuth()
    const [users, setUsers] = useState<UserData[]>([])
    const [loading, setLoading] = useState(true)
    const [editingUser, setEditingUser] = useState<UserData | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const [role, setRole] = useState('')
    const [contextId, setContextId] = useState('')

    const loadUsers = useCallback(async () => {
        try {
            if (!session?.access_token) return
            const data = await apiGet<UserData[]>('/users', session.access_token)
            setUsers(data)
        } catch (error) {
            console.error('Failed to load users', error)
            toast.error(t('super.users.toast.loadError'))
        } finally {
            setLoading(false)
        }
    }, [session, t])

    useEffect(() => {
        if (session?.access_token) {
            loadUsers()
        }
    }, [session, loadUsers])

    const handleEdit = (u: UserData) => {
        setEditingUser(u)
        setRole(u.role)
        if (u.role === 'admin_region') setContextId(u.admin_region_id || '')
        else if (u.role === 'shop') setContextId(u.shop_id || '')
        else if (u.role === 'city') setContextId(u.city_id || '')
        else if (u.role === 'hq') setContextId(u.hq_id || '')
        else setContextId('')

        setIsDialogOpen(true)
    }

    const handleSave = async () => {
        if (!editingUser || !session?.access_token) return

        const payload: UserUpdatePayload = {
            role,
            admin_region_id: null,
            shop_id: null,
            city_id: null,
            hq_id: null,
        }

        if (role === 'admin_region') payload.admin_region_id = contextId
        if (role === 'shop') payload.shop_id = contextId
        if (role === 'city') payload.city_id = contextId
        if (role === 'hq') payload.hq_id = contextId

        try {
            await apiPut(`/users/${editingUser.id}`, payload, session.access_token)
            toast.success(t('super.users.toast.updated'))
            loadUsers()
            setIsDialogOpen(false)
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : t('common.unknownError')
            toast.error(`${t('super.users.toast.updateError')}: ${message}`)
        }
    }

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold mb-4">{t('super.users.title')}</h1>
                <p className="text-gray-500">
                    {t('super.users.subtitle')}
                </p>
            </header>

            <div className="table-scroll bg-white rounded-lg border shadow-sm">
                <Table className="min-w-[900px]">
                    <TableHeader className="bg-gray-50">
                        <TableRow>
                            <TableHead>{t('common.email')}</TableHead>
                            <TableHead>{t('super.users.table.role')}</TableHead>
                            <TableHead className="hidden lg:table-cell">{t('super.users.table.context')}</TableHead>
                            <TableHead className="hidden lg:table-cell">{t('super.users.table.lastLogin')}</TableHead>
                            <TableHead className="text-right">{t('super.users.table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center p-8">{t('common.loading')}</TableCell></TableRow>
                        ) : users.map(u => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">{u.email}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize bg-gray-50">
                                        {t(`role.${u.role}`) !== `role.${u.role}` ? t(`role.${u.role}`) : roleLabel(u.role)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell font-mono text-xs text-gray-500">
                                    {u.admin_region_id && <div>{t('super.users.context.region')}: {u.admin_region_id}</div>}
                                    {u.shop_id && <div>{t('super.users.context.shop')}: {u.shop_id}</div>}
                                    {u.city_id && <div>{t('super.users.context.city')}: {u.city_id}</div>}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString(locale === 'de' ? 'de-CH' : locale === 'it' ? 'it-CH' : locale === 'en' ? 'en-CH' : 'fr-CH') : t('super.users.never')}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(u)}>
                                        {t('common.edit')}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('super.users.dialog.title')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="text-sm font-medium">{editingUser?.email}</div>

                        <div className="space-y-2">
                            <Label>{t('super.users.table.role')}</Label>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="authenticated">{t('super.users.role.authenticated')}</SelectItem>
                                    <SelectItem value="super_admin">{t('super.users.role.superAdmin')}</SelectItem>
                                    <SelectItem value="admin_region">{t('super.users.role.adminRegion')}</SelectItem>
                                    <SelectItem value="shop">{t('super.users.role.shop')}</SelectItem>
                                    <SelectItem value="city">{t('super.users.role.city')}</SelectItem>
                                    <SelectItem value="hq">{t('super.users.role.hq')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {['admin_region', 'shop', 'city', 'hq'].includes(role) && (
                            <div className="space-y-2">
                                <Label>{t('super.users.dialog.entityId')}</Label>
                                <Input
                                    value={contextId}
                                    onChange={e => setContextId(e.target.value)}
                                    placeholder={t('super.users.dialog.entityPlaceholder')}
                                />
                                <p className="text-xs text-gray-500">
                                    {t('super.users.dialog.entityHelp')}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave}>{t('super.users.save')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
