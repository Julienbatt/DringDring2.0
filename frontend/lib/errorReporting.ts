import * as Sentry from '@sentry/browser'

export function captureError(error: unknown, context?: string): void {
    if (error instanceof Error) {
        Sentry.captureException(error, context ? { tags: { context } } : undefined)
    } else {
        Sentry.captureMessage(String(error), { level: 'error', tags: context ? { context } : undefined })
    }
    if (process.env.NODE_ENV === 'development') {
        console.error(context ? `[${context}]` : '[error]', error)
    }
}
