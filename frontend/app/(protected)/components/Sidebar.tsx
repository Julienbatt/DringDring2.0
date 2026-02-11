'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../providers/AuthProvider'
import type { AdminRegionContext } from '../providers/AuthProvider'
import BrandLogo from '@/components/BrandLogo'
import { roleLabel } from '@/lib/roleLabel'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import {
    LayoutDashboard,
    Map,
    Users,
    Store,
    Bike,
    
    Settings,
    
    LogOut,
    Building2,
    Euro,
    MapPin,
    ListTodo,
    UserCircle,
    Tags,
    LifeBuoy,
    Menu,
    X,
    Megaphone
} from 'lucide-react'

// Map roles to navigation items based on SPECIFICATION
const getNavItems = (role: string, adminContextRegion: AdminRegionContext, canDispatch: boolean) => {


    // Base Items (available to generic logged in users if no specific role match?)
    // Actually, we should be strict.

    // SUPER ADMIN
    if (role === 'super_admin' && !adminContextRegion) {
        return [
            { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.regionalCompanies', href: '/super/regions', icon: Map },
            { labelKey: 'nav.users', href: '/super/users', icon: Users }, // To implement
        ]
    }

    // ADMIN REGION (or Super Admin in Drill-Down)
    if (role === 'admin_region' || (role === 'super_admin' && adminContextRegion)) {
        return [
            { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.dispatch', href: '/admin/dispatch', icon: ListTodo }, // "Courses (DISPATCH)"
            { labelKey: 'nav.couriers', href: '/admin/couriers', icon: Bike },
            { labelKey: 'nav.shops', href: '/admin/shops', icon: Store },
            { labelKey: 'nav.hq', href: '/admin/hqs', icon: Building2 },
            { labelKey: 'nav.clients', href: '/admin/clients', icon: Users },
            { labelKey: 'nav.billing', href: '/admin/billing', icon: Euro },
            { labelKey: 'nav.tariffs', href: '/admin/tariffs', icon: Tags },
            { labelKey: 'nav.partnerCities', href: '/admin/cities', icon: MapPin }, // "Communes partenaires" management
            { labelKey: 'nav.whyDring', href: '/resources/presentation', icon: Megaphone },
        ]
    }

    // HQ
    if (role === 'hq') {
        return [
            { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.shops', href: '/hq/shops', icon: Store },
            { labelKey: 'nav.billing', href: '/hq/billing', icon: Euro },
            { labelKey: 'nav.whyDring', href: '/resources/presentation', icon: Megaphone },
        ]
    }

    // SHOP
    if (role === 'shop') {
        return [
            { labelKey: 'nav.deliveries', href: '/dashboard', icon: ListTodo },
            { labelKey: 'nav.billing', href: '/shop/billing', icon: Euro },
            { labelKey: 'nav.whyDring', href: '/resources/presentation', icon: Megaphone },
        ]
    }

    // CITY
    if (role === 'city') {
        return [
            { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.billing', href: '/city/billing', icon: Euro }, // Spec says "Facturation City"
            { labelKey: 'nav.partnerCities', href: '/admin/cities', icon: MapPin },
            { labelKey: 'nav.whyDring', href: '/resources/presentation', icon: Megaphone },
        ]
    }

    // CUSTOMER
    if (role === 'customer') {
        return [
            { labelKey: 'nav.home', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.history', href: '/customer/deliveries', icon: ListTodo },
            { labelKey: 'nav.account', href: '/customer/profile', icon: UserCircle },
            { labelKey: 'nav.support', href: '/customer/support', icon: LifeBuoy },
        ]
    }

    // COURIER (Simple CRUD role mostly, but if they log in?)
    if (role === 'courier') {
        return [
            { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
            ...(canDispatch ? [{ labelKey: 'nav.dispatch', href: '/courier/dispatch', icon: ListTodo }] : []),
        ]
    }

    return []
}

export default function Sidebar() {
    const { user, loading, adminContextRegion, setAdminContext, signOut } = useAuth()
    const { t } = useLanguage()
    const pathname = usePathname()
    const [mobileOpen, setMobileOpen] = useState(false)

    if (loading) return <div className="w-64 bg-gray-900 h-screen animate-pulse"></div>

    const role = user?.role ?? 'guest'
    const navItems = getNavItems(role, adminContextRegion, !!user?.can_dispatch)
    const settingsHref = role === 'customer' ? '/customer/profile' : '/settings'

    return (
        <>
            {/* Mobile toggle */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="fixed right-3 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow sm:hidden"
                aria-label={t('common.openMenu')}
            >
                <Menu className="h-4 w-4" />
            </button>

            {/* Backdrop */}
            {mobileOpen && (
                <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-black/30 sm:hidden"
                    aria-label={t('common.closeMenu')}
                />
            )}

            <div
                className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col bg-slate-100 text-slate-900 transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                } sm:translate-x-0 sm:w-52 md:w-60 lg:w-64`}
            >
            {/* Header */}
                <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-slate-100 px-4">
                    <div className="flex items-center gap-2">
                        <BrandLogo width={216} height={68} className="h-12 w-auto max-w-[208px]" priority alt={t('common.brandName')} />
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-white"
                        aria-label={t('common.closeMenu')}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

            {/* Context Banner (Drill Down) */}
            {adminContextRegion && (
                <div className="flex items-center justify-between bg-emerald-50 px-2 lg:px-4 py-2 text-xs text-emerald-900">
                    <span className="truncate" title={adminContextRegion.name}>{adminContextRegion.name}</span>
                    {role === 'super_admin' && (
                        <button
                            onClick={() => {
                                setAdminContext(null)
                                window.location.href = '/super/regions'
                            }}
                            className="text-emerald-900 hover:text-red-600 underline"
                        >
                            {t('common.exitContext')}
                        </button>
                    )}
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto px-2 md:px-4 py-6">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            title={t(item.labelKey)}
                            className={`flex items-center justify-center sm:justify-start rounded-lg px-2 sm:px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                                isActive
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                            }`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <Icon className={`mr-0 sm:mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                            <span className="inline">{t(item.labelKey)}</span>
                        </Link>
                    )
                })}
                <button
                    type="button"
                    onClick={async () => {
                        setMobileOpen(false)
                        await signOut()
                    }}
                    className="sm:hidden mt-4 flex w-full items-center justify-center rounded-lg px-2 py-3 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-900"
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('common.logout')}
                </button>
            </nav>

            {/* Footer / User Profile */}
            <div className="border-t border-slate-200 bg-slate-100 p-3 lg:p-4 mt-auto">
                <div className="mb-3 flex items-center gap-3 justify-center sm:justify-start">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        {user?.email?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="block flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate">{user?.email}</p>
                        <p className="text-xs text-slate-500">
                            {t(`role.${role}`) !== `role.${role}` ? t(`role.${role}`) : roleLabel(role)}
                        </p>
                    </div>
                </div>
                <div className="mb-3">
                    <LanguageSwitcher />
                </div>
                <Link
                    href={settingsHref}
                    title={t('common.settings')}
                    className="flex items-center justify-center sm:justify-start rounded px-2 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-900"
                    onClick={() => setMobileOpen(false)}
                >
                    <Settings className="w-4 h-4 mr-0 sm:mr-2" />
                    <span className="inline">{t('common.settings')}</span>
                </Link>
                <button
                    type="button"
                    onClick={async () => {
                        setMobileOpen(false)
                        await signOut()
                    }}
                    className="mt-2 flex w-full items-center justify-center sm:justify-start rounded px-2 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-900"
                >
                    <LogOut className="w-4 h-4 mr-0 sm:mr-2" />
                    <span className="inline">{t('common.logout')}</span>
                </button>
            </div>
            </div>
        </>
    )
}
