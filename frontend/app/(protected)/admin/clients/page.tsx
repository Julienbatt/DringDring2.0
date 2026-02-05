'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, MapPin, Phone, User, Key, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ClientDialog, ClientData } from './components/ClientDialog'

type Client = {
    id: string
    name: string
    address: string
    postal_code: string
    city_id: string
    city_real_name?: string
    city_name?: string
    phone?: string
    floor?: string
    door_code?: string
    is_cms: boolean
}

export default function ClientsPage() {
    const { session, adminContextRegion } = useAuth()
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedClient, setSelectedClient] = useState<ClientData | null>(null)
    const cmsCount = clients.filter((client) => client.is_cms).length
    const standardCount = clients.length - cmsCount

    useEffect(() => {
        if (session?.access_token) {
            loadClients()
        }
    }, [session, adminContextRegion])

    const loadClients = async () => {
        try {
            if (!session?.access_token) return
            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const data = await apiGet<Client[]>(`/clients/admin${queryParams}`, session.access_token)
            setClients(data)
        } catch (error) {
            console.error('Failed to load clients', error)
            toast.error('Erreur lors du chargement des clients')
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = () => {
        setSelectedClient(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (client: Client) => {
        setSelectedClient(client)
        setIsDialogOpen(true)
    }

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.city_real_name || client.city_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.postal_code.includes(searchTerm)
    )

    if (loading) return <LoadingSkeleton />

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestion des clients</h1>
                    <p className="text-gray-500 mt-1">
                        {clients.length} clients enregistres.
                    </p>
                </div>
                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Nouveau client
                </Button>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
                <div className="min-w-[160px] rounded-lg border bg-white px-4 py-3 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Total</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{clients.length}</div>
                </div>
                <div className="min-w-[160px] rounded-lg border bg-white px-4 py-3 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Clients CMS</div>
                    <div className="mt-1 text-2xl font-semibold text-emerald-700">{cmsCount}</div>
                </div>
                <div className="min-w-[180px] rounded-lg border bg-white px-4 py-3 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Clients standards</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{standardCount}</div>
                </div>
            </div>

            <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
                <Search className="w-4 h-4 text-gray-400 ml-2" />
                <Input
                    placeholder="Rechercher (nom, commune, NPA)..."
                    className="border-none shadow-none focus-visible:ring-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden md:hidden">
                {filteredClients.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-gray-500">
                        {searchTerm ? 'Aucun client ne correspond.' : 'Aucun client trouve.'}
                    </div>
                ) : (
                    <div className="divide-y">
                        {filteredClients.map((client) => (
                            <button
                                key={client.id}
                                className="w-full text-left p-4 hover:bg-gray-50/50 transition-colors"
                                onClick={() => handleEdit(client)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                                            <User className="w-4 h-4 text-gray-500" />
                                            {client.name}
                                        </div>
                                        {client.phone && (
                                            <div className="flex items-center gap-2 text-sm text-gray-500 ml-6 mt-1">
                                                <Phone className="w-3 h-3" />
                                                {client.phone}
                                            </div>
                                        )}
                                    </div>
                                    {client.is_cms ? (
                                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                            CMS
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-gray-400">Standard</span>
                                    )}
                                </div>

                                <div className="mt-3 text-sm text-gray-700">
                                    <div>{client.address}</div>
                                    {(client.floor || client.door_code) && (
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                                            {client.floor && (
                                                <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    <Building className="w-3 h-3" /> Etage: {client.floor}
                                                </span>
                                            )}
                                            {client.door_code && (
                                                <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    <Key className="w-3 h-3" /> Code: {client.door_code}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-gray-400" />
                                        {client.postal_code} {client.city_real_name || client.city_name}
                                    </div>
                                    <span className="text-xs font-medium text-emerald-700">Modifier</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden hidden md:block">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[300px]">Identite et contact</TableHead>
                            <TableHead>Adresse et acces</TableHead>
                            <TableHead>Localisation</TableHead>
                            <TableHead className="text-center">Profil</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredClients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-gray-500">
                                    {searchTerm ? 'Aucun client ne correspond.' : 'Aucun client trouve.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredClients.map((client) => (
                                <TableRow
                                    key={client.id}
                                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                                    onClick={() => handleEdit(client)}
                                >
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                                                <User className="w-4 h-4 text-gray-500" />
                                                {client.name}
                                            </div>
                                            {client.phone && (
                                                <div className="flex items-center gap-2 text-sm text-gray-500 ml-6">
                                                    <Phone className="w-3 h-3" />
                                                    {client.phone}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1 text-sm">
                                            <div className="text-gray-900">{client.address}</div>
                                            {(client.floor || client.door_code) && (
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    {client.floor && (
                                                        <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            <Building className="w-3 h-3" /> Etage: {client.floor}
                                                        </span>
                                                    )}
                                                    {client.door_code && (
                                                        <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            <Key className="w-3 h-3" /> Code: {client.door_code}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <MapPin className="w-4 h-4 text-gray-400" />
                                            {client.postal_code} {client.city_real_name || client.city_name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {client.is_cms ?
                                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                CMS
                                            </Badge> :
                                            <span className="text-xs text-gray-400">Standard</span>
                                        }
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                handleEdit(client)
                                            }}
                                        >
                                            Modifier
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <ClientDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                clientToEdit={selectedClient}
                onSuccess={loadClients}
            />
        </div>
    )
}
