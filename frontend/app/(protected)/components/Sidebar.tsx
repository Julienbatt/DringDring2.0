'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../providers/AuthProvider'
import BrandLogo from '@/components/BrandLogo'
import { roleLabel } from '@/lib/roleLabel'
import {
    LayoutDashboard,
    Map,
    Users,
    Store,
    Bike,
    FileText,
    Settings,
    ShoppingBag,
    LogOut,
    Building2,
    Euro,
    MapPin,
    ListTodo,
    UserCircle,
    Tags,
    LifeBuoy,
    Menu,
    X
} from 'lucide-react'

// Map roles to navigation items based on SPECIFICATION
const getNavItems = (role: string, adminContextRegion: any, canDispatch: boolean) => {


    // Base Items (available to generic logged in users if no specific role match?)
    // Actually, we should be strict.

    // SUPER ADMIN
    if (role === 'super_admin' && !adminContextRegion) {
        return [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Entreprises regionales de livraison', href: '/super/regions', icon: Map },
            { label: 'Utilisateurs', href: '/super/users', icon: Users }, // To implement
        ]
    }

    // ADMIN REGION (or Super Admin in Drill-Down)
    if (role === 'admin_region' || (role === 'super_admin' && adminContextRegion)) {
        return [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Dispatch', href: '/admin/dispatch', icon: ListTodo }, // "Courses (DISPATCH)"
            { label: 'Coursiers', href: '/admin/couriers', icon: Bike },
            { label: 'Commerces', href: '/admin/shops', icon: Store },
            { label: 'HQ', href: '/admin/hqs', icon: Building2 },
            { label: 'Clients', href: '/admin/clients', icon: Users },
            { label: 'Facturation', href: '/admin/billing', icon: Euro },
            { label: 'Tarification', href: '/admin/tariffs', icon: Tags },
            { label: 'Communes partenaires', href: '/admin/cities', icon: MapPin }, // "Communes partenaires" management
        ]
    }

    // HQ
    if (role === 'hq') {
        return [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Commerces', href: '/hq/shops', icon: Store },
            { label: 'Facturation', href: '/hq/billing', icon: Euro },
        ]
    }

    // SHOP
    if (role === 'shop') {
        return [
            { label: 'Livraisons', href: '/dashboard', icon: ListTodo },
            { label: 'Facturation', href: '/shop/billing', icon: Euro },
        ]
    }

    // CITY
    if (role === 'city') {
        return [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Facturation', href: '/city/billing', icon: Euro }, // Spec says "Facturation City"
            { label: 'Communes partenaires', href: '/admin/cities', icon: MapPin },
        ]
    }

    // CUSTOMER
    if (role === 'customer') {
        return [
            { label: 'Accueil', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Historique', href: '/customer/deliveries', icon: ListTodo },
            { label: 'Mon compte', href: '/customer/profile', icon: UserCircle },
            { label: 'Aide & support', href: '/customer/support', icon: LifeBuoy },
        ]
    }

    // COURIER (Simple CRUD role mostly, but if they log in?)
    if (role === 'courier') {
        return [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            ...(canDispatch ? [{ label: 'Dispatch', href: '/courier/dispatch', icon: ListTodo }] : []),
        ]
    }

    return []
}

export default function Sidebar() {
    const { user, loading, adminContextRegion, setAdminContext, signOut } = useAuth()
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
                aria-label="Ouvrir le menu"
            >
                <Menu className="h-4 w-4" />
            </button>

            {/* Backdrop */}
            {mobileOpen && (
                <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-black/30 sm:hidden"
                    aria-label="Fermer le menu"
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
                        <BrandLogo width={140} height={42} className="h-8 w-auto max-w-[140px]" priority />
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-white"
                        aria-label="Fermer le menu"
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
                            Sortir
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
                            title={item.label}
                            className={`flex items-center justify-center sm:justify-start rounded-lg px-2 sm:px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                                isActive
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                            }`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <Icon className={`mr-0 sm:mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                            <span className="inline">{item.label}</span>
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
                    Se deconnecter
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
                        <p className="text-xs text-slate-500">{roleLabel(role)}</p>
                    </div>
                </div>
                <Link
                    href={settingsHref}
                    title="Parametres"
                    className="flex items-center justify-center sm:justify-start rounded px-2 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-900"
                    onClick={() => setMobileOpen(false)}
                >
                    <Settings className="w-4 h-4 mr-0 sm:mr-2" />
                    <span className="inline">Parametres</span>
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
                    <span className="inline">Se deconnecter</span>
                </button>
            </div>
            </div>
        </>
    )
}
