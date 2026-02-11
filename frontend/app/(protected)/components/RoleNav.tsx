'use client'

import Link from 'next/link'
import { useAuth } from '../providers/AuthProvider'
import BrandLogo from '@/components/BrandLogo'
import { roleLabel } from '@/lib/roleLabel'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

const NAV_ITEMS = [
  { labelKey: 'nav.dashboard', href: '/dashboard', roles: ['admin_region', 'super_admin', 'courier', 'customer', 'city', 'hq'] },
  { labelKey: 'nav.deliveries', href: '/dashboard', roles: ['shop'] },
  { labelKey: 'nav.clients', href: '/admin/clients', roles: ['admin_region'] },
  { labelKey: 'nav.shops', href: '/admin/shops', roles: ['admin_region'] },
  { labelKey: 'nav.partnerCities', href: '/admin/cities', roles: ['admin_region'] },
  { labelKey: 'nav.couriers', href: '/admin/couriers', roles: ['admin_region', 'super_admin'] },
  { labelKey: 'nav.billing', href: '/admin/billing', roles: ['admin_region'] },
  { labelKey: 'nav.dispatch', href: '/admin/dispatch', roles: ['admin_region'] },
  { labelKey: 'nav.regionalCompanies', href: '/super/regions', roles: ['super_admin'] },
  { labelKey: 'nav.shops', href: '/hq/shops', roles: ['hq'] },
  { labelKey: 'nav.billing', href: '/hq/billing', roles: ['hq'] },
  { labelKey: 'nav.billing', href: '/city/billing', roles: ['city'] },
  { labelKey: 'nav.billing', href: '/shop/billing', roles: ['shop'] },
  { labelKey: 'nav.whyDring', href: '/resources/presentation', roles: ['admin_region', 'hq', 'shop', 'city'] },
  { labelKey: 'nav.history', href: '/customer/deliveries', roles: ['customer'] },
  { labelKey: 'nav.account', href: '/customer/profile', roles: ['customer'] },
  { labelKey: 'nav.support', href: '/customer/support', roles: ['customer'] },
  { labelKey: 'common.settings', href: '/settings', roles: ['shop', 'admin_region', 'super_admin', 'courier', 'city', 'hq'] },
]

export default function RoleNav() {
  const { user, loading, adminContextRegion, setAdminContext } = useAuth()
  const { t } = useLanguage()

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
    items.push({ labelKey: 'nav.dispatch', href: '/courier/dispatch', roles: ['courier'] })
  }

  return (
    <div className="border-b bg-white">
      <div className="flex w-full items-center justify-between px-6 py-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo width={120} height={36} className="h-7 w-auto" alt={t('common.brandName')} />
            {adminContextRegion && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                {adminContextRegion.name}
              </span>
            )}
          </div>
          <nav className="flex items-center gap-3 text-gray-600">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="hover:underline">
                {t(item.labelKey)}
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
              {t('common.exitView')}
            </button>
          )}
          <span>{t(`role.${role}`) !== `role.${role}` ? t(`role.${role}`) : roleLabel(role)}</span>
        </div>
      </div>
    </div>
  )
}
