'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, LogIn, ArrowRight } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()
    const { t } = useLanguage()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                toast.error(t('login.badCreds'))
                return
            }

            if (!data.session) {
                toast.error(t('login.sessionError'))
                return
            }

            toast.success(t('login.welcomeBack'))
            router.refresh()
            router.push('/dashboard')
        } catch (err: unknown) {
            console.error('Login Error:', err)
            toast.error(t('login.systemError'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mb-2">
                        <Lock className="w-6 h-6" />
                    </div>
                    <div className="flex justify-center">
                        <BrandLogo width={180} height={54} className="h-12 w-auto" priority alt={t('common.brandName')} />
                    </div>
                    <p className="text-slate-500">{t('login.portal')}</p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="relative h-32 bg-slate-100 sm:h-40">
                        <Image
                            src="/brand/poster2.png"
                            alt={t('common.brandName')}
                            fill
                            className="object-contain p-2 sm:object-cover sm:p-0"
                            priority
                        />
                    </div>
                    <div className="space-y-3 p-4 text-sm text-slate-600">
                        <p className="text-base font-semibold text-slate-900">{t('login.posterTitle')}</p>
                        <ul className="list-disc space-y-1 pl-4">
                            <li>{t('login.posterBullet1')}</li>
                            <li>{t('login.posterBullet2')}</li>
                            <li>{t('login.posterBullet3')}</li>
                            <li>{t('login.posterBullet4')}</li>
                        </ul>
                    </div>
                </div>

                <Card className="border-0 shadow-xl bg-white/90 backdrop-blur">
                    <CardHeader>
                        <CardTitle>{t('login.title')}</CardTitle>
                        <CardDescription>
                            {t('login.desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">{t('login.email')}</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder={t('login.emailPlaceholder')}
                                    className="bg-white"
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">{t('login.password')}</Label>
                                    <Link
                                        href="#"
                                        className="text-xs text-emerald-700 hover:underline"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            toast.info(t('login.contactAdmin'))
                                        }}
                                    >
                                        {t('login.forgot')}
                                    </Link>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    className="bg-white"
                                    value={password} onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                                <LogIn className="w-4 h-4 mr-2" />
                                {loading ? t('login.submitting') : t('login.submit')}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 bg-gray-50/50 p-6 border-t">
                        <div className="text-center text-sm text-gray-500">
                            {t('login.newCustomer')}
                        </div>
                        <Link href="/register" className="w-full">
                            <Button variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                {t('login.createAccount')} <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                        <p className="text-xs text-center text-gray-400 mt-2">
                            {t('login.alreadyPartner')}
                        </p>
                    </CardFooter>
                </Card>

                <p className="text-center text-xs text-slate-400">
                    &copy; 2025 DringDring. Secure Logistics.
                </p>
            </div>
        </div>
    )
}
