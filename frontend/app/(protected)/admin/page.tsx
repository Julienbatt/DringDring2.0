'use client'

import { useEffect, useState } from 'react'
import { Activity, Bike, CheckCircle, Clock, Leaf, Users, Store } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { apiGet } from '@/lib/api'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Delivery {
  status: string
}

interface Courier {
  active: boolean
}

export default function AdminDashboardPage() {
  const { adminContextRegion } = useAuth()
  const [stats, setStats] = useState({
    todayTotal: 0,
    todayPending: 0,
    todayCompleted: 0,
    activeCouriers: 0,
    totalCouriers: 0,
  })
  const [loading, setLoading] = useState(true)
  const currentMonth = format(new Date(), 'yyyy-MM')
  const { data: ecoStats, loading: ecoLoading } = useEcoStats(
    currentMonth,
    adminContextRegion?.id
  )

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const supabase = createClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        if (!session) return

        const today = new Date().toISOString().split('T')[0]
        const regionQuery = adminContextRegion
          ? `?admin_region_id=${adminContextRegion.id}`
          : ''

        const deliveries = await apiGet<Delivery[]>(
          `/dispatch/deliveries?date_from=${today}&date_to=${today}${
            adminContextRegion ? `&admin_region_id=${adminContextRegion.id}` : ''
          }`,
          session.access_token
        )
        const couriers = await apiGet<Courier[]>(
          `/couriers${regionQuery}`,
          session.access_token
        )

        setStats({
          todayTotal: deliveries.length,
          todayPending: deliveries.filter((d) =>
            ['pending', 'assigned', 'picked_up'].includes(d.status)
          ).length,
          todayCompleted: deliveries.filter((d) => d.status === 'delivered')
            .length,
          activeCouriers: couriers.filter((c) => c.active).length,
          totalCouriers: couriers.length,
        })
      } catch (e) {
        console.error('Dashboard stats error', e)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [adminContextRegion])

  const todayStr = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })
  const capitalizedToday = todayStr.charAt(0).toUpperCase() + todayStr.slice(1)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Tableau de bord</h1>
        <p className="text-slate-500">
          Vue d ensemble pour le {capitalizedToday}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Livraisons du jour</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '-' : stats.todayTotal}</div>
            <p className="text-xs text-muted-foreground">Commandes recues aujourd hui</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En cours</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {loading ? '-' : stats.todayPending}
            </div>
            <p className="text-xs text-muted-foreground">Necessitent une action</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terminees</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? '-' : stats.todayCompleted}
            </div>
            <p className="text-xs text-muted-foreground">Livrees avec succes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flotte active</CardTitle>
            <Bike className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {loading ? '-' : `${stats.activeCouriers} / ${stats.totalCouriers}`}
            </div>
            <p className="text-xs text-muted-foreground">Coursiers disponibles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Km a velo (mois)</CardTitle>
            <Bike className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {ecoLoading || !ecoStats ? '-' : ecoStats.distance_km.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">Estimation aller-retour</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CO2 economise (kg)</CardTitle>
            <Leaf className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {ecoLoading || !ecoStats ? '-' : ecoStats.co2_saved_kg.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">Base voiture 93.6 g/km</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Acces rapide</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/dispatch">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Activity className="w-6 h-6 text-emerald-600" />
              <span>Gerer le dispatch</span>
            </Button>
          </Link>

          <Link href="/admin/clients">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Users className="w-6 h-6 text-emerald-600" />
              <span>Gerer les clients</span>
            </Button>
          </Link>

          <Link href="/admin/shops">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Store className="w-6 h-6 text-emerald-600" />
              <span>Gerer les commerces</span>
            </Button>
          </Link>

          <Link href="/admin/couriers">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Bike className="w-6 h-6 text-emerald-600" />
              <span>Gerer la flotte</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-emerald-50 border-emerald-100">
          <CardHeader>
            <CardTitle className="text-emerald-800 text-lg">Facturation et rapports</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-emerald-700 mb-4">
              Consultez les rapports mensuels et gerez la facturation des commerces.
            </p>
            <Link href="/admin/billing">
              <Button className="bg-emerald-600 hover:bg-emerald-700">Acceder a la facturation</Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-100">
          <CardHeader>
            <CardTitle className="text-gray-800 text-lg">Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Gerez les tarifs de livraison et les zones de couverture (communes partenaires).
            </p>
            <div className="flex gap-2">
              <Link href="/admin/tariffs">
                <Button variant="secondary">Tarifs</Button>
              </Link>
              <Link href="/admin/cities">
                <Button variant="secondary">Communes partenaires</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
