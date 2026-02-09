'use client'

import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { useRewardStats } from '@/app/(protected)/hooks/useRewardStats'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function AdminRegionDashboard() {
    const { t } = useLanguage()
    const { adminContextRegion } = useAuth()
    const currentMonth = new Date().toISOString().slice(0, 7)
    const { data: ecoStats, loading: ecoLoading } = useEcoStats(
        currentMonth,
        adminContextRegion?.id
    )
    const { data: rewardStats, loading: rewardLoading } = useRewardStats(
        adminContextRegion?.id
    )

    const tierStyles: Record<string, string> = {
        Gold: 'border-amber-200 bg-amber-50 text-amber-700',
        Silver: 'border-slate-200 bg-slate-100 text-slate-700',
        Bronze: 'border-orange-200 bg-orange-50 text-orange-700',
        Base: 'border-slate-200 bg-white text-slate-500',
    }

    const quickLinks = [
        {
            href: '/admin/shops',
            title: t('admin.regionLanding.links.shops.title'),
            description: t('admin.regionLanding.links.shops.description'),
        },
        {
            href: '/admin/clients',
            title: t('admin.regionLanding.links.clients.title'),
            description: t('admin.regionLanding.links.clients.description'),
        },
        {
            href: '/admin/dispatch',
            title: t('admin.regionLanding.links.dispatch.title'),
            description: t('admin.regionLanding.links.dispatch.description'),
        },
        {
            href: '/admin/billing',
            title: t('admin.regionLanding.links.billing.title'),
            description: t('admin.regionLanding.links.billing.description'),
        },
    ]

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex w-full flex-col gap-8 px-4 pb-16 pt-6 md:px-8">
                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-6 p-6 md:max-w-3xl md:p-10">
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                                <BrandLogo width={180} height={54} className="h-10 w-auto md:h-12" />
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">{t('admin.regionLanding.overline')}</p>
                                <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">{t('admin.regionLanding.title')}</h1>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 md:text-base">
                            {t('admin.regionLanding.subtitle')}
                        </p>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('admin.regionLanding.kpi.deliveries')}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {ecoLoading || !ecoStats ? '-' : ecoStats.deliveries}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">{t('admin.regionLanding.kpi.period', { month: currentMonth })}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">{t('admin.regionLanding.kpi.km')}</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-700">
                            {ecoLoading || !ecoStats ? '-' : ecoStats.distance_km.toFixed(1)}
                        </p>
                        <p className="mt-1 text-xs text-emerald-600/80">{t('admin.regionLanding.kpi.kmHint')}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">{t('admin.regionLanding.kpi.co2')}</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-700">
                            {ecoLoading || !ecoStats ? '-' : ecoStats.co2_saved_kg.toFixed(1)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('admin.regionLanding.kpi.co2Hint')}</p>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {quickLinks.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                        >
                            <h2 className="mb-2 text-lg font-semibold text-slate-900 group-hover:text-emerald-700">
                                {item.title}
                            </h2>
                            <p className="text-sm text-slate-600">{item.description}</p>
                        </Link>
                    ))}
                </div>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">{t('admin.regionLanding.reward.overline')}</p>
                            <h2 className="text-xl font-semibold text-slate-900">{t('admin.regionLanding.reward.title')}</h2>
                            <p className="text-sm text-slate-500">
                                {t('admin.regionLanding.reward.window', { months: rewardStats?.window_months ?? 6 })}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            {rewardLoading || !rewardStats ? (
                                <span>{t('admin.regionLanding.reward.loadingThresholds')}</span>
                            ) : rewardStats.ready ? (
                                <div className="space-y-1">
                                    <div>{t('admin.regionLanding.reward.thresholdsBronze', { score: rewardStats.thresholds.bronze.toFixed(2) })}</div>
                                    <div>{t('admin.regionLanding.reward.thresholdsSilver', { score: rewardStats.thresholds.silver.toFixed(2) })}</div>
                                    <div>{t('admin.regionLanding.reward.thresholdsGold', { score: rewardStats.thresholds.gold.toFixed(2) })}</div>
                                </div>
                            ) : (
                                <span>
                                    {t('admin.regionLanding.reward.calibrating', {
                                        available: rewardStats.months_available,
                                        total: rewardStats.window_months,
                                    })}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3">
                        {rewardLoading ? (
                            <div className="text-sm text-slate-500">{t('admin.regionLanding.reward.loadingShops')}</div>
                        ) : !rewardStats || rewardStats.rows.length === 0 ? (
                            <div className="text-sm text-slate-500">{t('admin.regionLanding.reward.empty')}</div>
                        ) : (
                            rewardStats.rows.slice(0, 5).map((row) => (
                                <div
                                    key={row.shop_id}
                                    className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{row.shop_name}</p>
                                        <p className="text-xs text-slate-500">
                                            {t('admin.regionLanding.reward.rowMeta', {
                                                deliveries: row.deliveries_total,
                                                active: row.active_months,
                                                total: rewardStats.window_months,
                                            })}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${tierStyles[row.tier] ?? tierStyles.Base}`}
                                        >
                                            {row.tier}
                                        </span>
                                        <div className="text-right text-xs text-slate-500">
                                            {t('admin.regionLanding.reward.score', { score: row.score.toFixed(2) })}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}
