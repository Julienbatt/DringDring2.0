'use client'

import { useEffect } from 'react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
            <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-100 max-w-md w-full">
                <div className="mb-6 flex justify-center">
                    <div className="bg-red-50 p-4 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>
                </div>

                <h2 className="mb-2 text-xl font-bold text-gray-900">Une erreur est survenue</h2>
                <p className="mb-6 text-sm text-gray-500">
                    Nous sommes désolés, mais nous n&apos;avons pas pu charger cette page correctement.
                </p>

                <div className="space-y-3">
                    <button
                        onClick={() => reset()}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
                    >
                        Réessayer
                    </button>
                    <a
                        href="/dashboard"
                        className="block w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
                    >
                        Retour au Dashboard
                    </a>
                </div>
            </div>
        </div>
    )
}
