'use client'

import { useState, useEffect } from 'react'
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

export default function SuperAdminUsersPage() {
    const { session } = useAuth()
    const [users, setUsers] = useState<UserData[]>([])
    const [loading, setLoading] = useState(true)
    const [editingUser, setEditingUser] = useState<UserData | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const [role, setRole] = useState('')
    const [contextId, setContextId] = useState('')

    useEffect(() => {
        if (session?.access_token) {
            loadUsers()
        }
    }, [session])

    const loadUsers = async () => {
        try {
            if (!session?.access_token) return
            const data = await apiGet<UserData[]>('/users', session.access_token)
            setUsers(data)
        } catch (error) {
            console.error('Failed to load users', error)
            toast.error('Erreur chargement utilisateurs')
        } finally {
            setLoading(false)
        }
    }

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

        const payload: any = { role }
        payload.admin_region_id = null
        payload.shop_id = null
        payload.city_id = null
        payload.hq_id = null

        if (role === 'admin_region') payload.admin_region_id = contextId
        if (role === 'shop') payload.shop_id = contextId
        if (role === 'city') payload.city_id = contextId
        if (role === 'hq') payload.hq_id = contextId

        try {
            await apiPut(`/users/${editingUser.id}`, payload, session.access_token)
            toast.success('Utilisateur mis a jour')
            loadUsers()
            setIsDialogOpen(false)
        } catch (e: any) {
            toast.error('Erreur mise a jour: ' + e.message)
        }
    }

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold mb-4">Gestion des utilisateurs</h1>
                <p className="text-gray-500">
                    Definissez les roles et associez les utilisateurs aux entites (region, commerce, commune partenaire).
                </p>
            </header>

            <div className="table-scroll bg-white rounded-lg border shadow-sm">
                <Table className="min-w-[900px]">
                    <TableHeader className="bg-gray-50">
                        <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="hidden lg:table-cell">Contexte (ID)</TableHead>
                            <TableHead className="hidden lg:table-cell">Derniere connexion</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center p-8">Chargement...</TableCell></TableRow>
                        ) : users.map(u => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">{u.email}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize bg-gray-50">
                                        {roleLabel(u.role)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell font-mono text-xs text-gray-500">
                                    {u.admin_region_id && <div>Entreprise regionale: {u.admin_region_id}</div>}
                                    {u.shop_id && <div>Commerce: {u.shop_id}</div>}
                                    {u.city_id && <div>Commune: {u.city_id}</div>}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Jamais'}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(u)}>
                                        Modifier
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
                        <DialogTitle>Modifier utilisateur</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="text-sm font-medium">{editingUser?.email}</div>

                        <div className="space-y-2">
                            <Label>Role</Label>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="authenticated">Utilisateur (sans droits)</SelectItem>
                                    <SelectItem value="super_admin">Super admin</SelectItem>
                                    <SelectItem value="admin_region">Entreprise regionale de livraison</SelectItem>
                                    <SelectItem value="shop">Responsable commerce</SelectItem>
                                    <SelectItem value="city">Responsable commune</SelectItem>
                                    <SelectItem value="hq">HQ / Comptabilite</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {['admin_region', 'shop', 'city', 'hq'].includes(role) && (
                            <div className="space-y-2">
                                <Label>ID de l entite liee (region, commerce, commune, HQ)</Label>
                                <Input
                                    value={contextId}
                                    onChange={e => setContextId(e.target.value)}
                                    placeholder="UUID..."
                                />
                                <p className="text-xs text-gray-500">
                                    Copiez l ID depuis les pages de gestion (communes partenaires, commerces, etc.)
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave}>Enregistrer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
