'use client'

import { useEffect, useState } from 'react'
import { Search, Mail, Phone, MapPin, Store } from 'lucide-react'
import { Input } from '@/components/ui/input'
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

type Shop = {
  id: string
  name: string
  city_name?: string | null
  address?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
}

export default function HQShopsPage() {
  const { session } = useAuth()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (session?.access_token) {
      loadShops()
    }
  }, [session])

  const loadShops = async () => {
    setLoading(true)
    try {
      if (!session?.access_token) return
      const data = await apiGet<Shop[]>('/shops/hq', session.access_token)
      setShops(data)
    } catch (error) {
      console.error('Failed to load HQ shops', error)
      toast.error('Erreur lors du chargement des commerces')
    } finally {
      setLoading(false)
    }
  }

  const filteredShops = shops.filter((shop) => {
    const query = searchQuery.toLowerCase()
    return (
      shop.name.toLowerCase().includes(query) ||
      (shop.city_name || '').toLowerCase().includes(query) ||
      (shop.contact_person || '').toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Commerces du groupe
          </h1>
          <p className="text-gray-500 mt-1">
            {shops.length} commerces rattaches a votre siege.
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
        <Search className="w-4 h-4 text-gray-400 ml-2" />
        <Input
          placeholder="Rechercher (nom, commune, contact)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-none shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="table-scroll bg-white rounded-xl border shadow-sm">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Commerce</TableHead>
              <TableHead>Commune</TableHead>
              <TableHead className="hidden lg:table-cell">Adresse</TableHead>
              <TableHead className="hidden lg:table-cell">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center">
                  Chargement...
                </TableCell>
              </TableRow>
            ) : filteredShops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                  Aucun commerce pour ce siege.
                </TableCell>
              </TableRow>
            ) : (
              filteredShops.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <Store className="h-4 w-4 text-emerald-600" />
                      {shop.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{shop.city_name || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-gray-400" />
                      {shop.address || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-600">
                    <div className="space-y-1">
                      <div>{shop.contact_person || '-'}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Mail className="h-3 w-3" />
                        {shop.email || '-'}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Phone className="h-3 w-3" />
                        {shop.phone || '-'}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
