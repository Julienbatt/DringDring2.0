'use client'

import Link from 'next/link'
import { useAuth } from '../providers/AuthProvider'
import BrandLogo from '@/components/BrandLogo'
import { roleLabel } from '@/lib/roleLabel'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', roles: ['admin_region', 'super_admin', 'courier', 'customer', 'city', 'hq'] },
  { label: 'Livraisons', href: '/dashboard', roles: ['shop'] },
  { label: 'Clients', href: '/admin/clients', roles: ['admin_region'] },
  { label: 'Commerces', href: '/admin/shops', roles: ['admin_region'] },
  { label: 'Communes partenaires', href: '/admin/cities', roles: ['admin_region'] },
  { label: 'Coursiers', href: '/admin/couriers', roles: ['admin_region', 'super_admin'] },
  { label: 'Facturation', href: '/admin/billing', roles: ['admin_region'] },
  { label: 'Dispatch', href: '/admin/dispatch', roles: ['admin_region'] },
  { label: 'Entreprises regionales de livraison', href: '/super/regions', roles: ['super_admin'] },
  { label: 'Commerces', href: '/hq/shops', roles: ['hq'] },
  { label: 'Facturation HQ', href: '/hq/billing', roles: ['hq'] },
  { label: 'Facturation', href: '/city/billing', roles: ['city'] },
  { label: 'Facturation', href: '/shop/billing', roles: ['shop'] },
  { label: 'Historique', href: '/customer/deliveries', roles: ['customer'] },
  { label: 'Mon compte', href: '/customer/profile', roles: ['customer'] },
  { label: 'Aide & support', href: '/customer/support', roles: ['customer'] },
  { label: 'Parametres', href: '/settings', roles: ['shop', 'admin_region', 'super_admin', 'courier', 'city', 'hq'] },
]

export default function RoleNav() {
  const { user, loading, adminContextRegion, setAdminContext } = useAuth()

  if (loading) {
    return <div className="border-b bg-white" />
  }

  const role = user?.role ?? 'guest'

  let effectiveRole = role
  if (role === 'super_admin' && adminContextRegion) {
    effectiveRole = 'admin_region'
  }

  const items = NAV_ITEMS.filter((item) => item.roles.includes(effectiveRole))
  if (effectiveRole === 'courier' && user?.can_dispatch) {
    items.push({ label: 'Dispatch', href: '/courier/dispatch', roles: ['courier'] })
  }

  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo width={120} height={36} className="h-7 w-auto" />
            {adminContextRegion && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                {adminContextRegion.name}
              </span>
            )}
          </div>
          <nav className="flex items-center gap-3 text-gray-600">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-gray-500">
          {adminContextRegion && role === 'super_admin' && (
            <button
              onClick={() => {
                setAdminContext(null)
                window.location.href = '/super/regions'
              }}
              className="text-xs hover:text-red-600 underline"
            >
              Sortir de la vue
            </button>
          )}
          <span>{roleLabel(role)}</span>
        </div>
      </div>
    </div>
  )
}
