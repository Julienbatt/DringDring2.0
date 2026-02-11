'use client'

import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function GlobalError({
    error: _error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    void _error
    const { t } = useLanguage()
    return (
        <html>
            <body>
                <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center">
                    <h2 className="text-2xl font-bold mb-4">{t('error.global.title')}</h2>
                    <p className="mb-4 text-gray-500">{t('error.global.body')}</p>
                    <button
                        onClick={() => reset()}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                        {t('error.global.restart')}
                    </button>
                </div>
            </body>
        </html>
    )
}
