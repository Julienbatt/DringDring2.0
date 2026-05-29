'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'

export type CorrectionAuditRow = {
  id: string
  delivery_id: string
  actor_user_id: string | null
  actor_role: string | null
  field: string
  // The backend stores values as jsonb — they can be primitive (string/number),
  // ISO date strings, or null. We render via `formatValue` below.
  old_value: string | number | boolean | null
  new_value: string | number | boolean | null
  reason: string | null
  created_at: string
}

const KNOWN_FIELDS = new Set([
  'floor',
  'door_code',
  'notes',
  'bags',
  'order_amount',
  'basket_value',
  'delivery_date',
  'time_window',
])

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    // Try ISO date detection (YYYY-MM-DD or full ISO timestamp).
    // We keep the original locale-agnostic representation if the parse fails.
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        // Date-only string: show date; full ISO: show date+time.
        if (value.length === 10) return parsed.toLocaleDateString()
        return parsed.toLocaleString()
      }
    }
    return value
  }
  // Fallback for unknown shapes (objects, arrays).
  return JSON.stringify(value)
}

function shortId(value: string | null): string {
  if (!value) return '?'
  return value.length > 6 ? `${value.slice(0, 6)}…` : value
}

export function CorrectionHistoryPanel({
  deliveryId,
  open,
  onClose,
}: {
  deliveryId: string
  open: boolean
  onClose: () => void
}) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [rows, setRows] = useState<CorrectionAuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    if (!deliveryId || !session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<CorrectionAuditRow[]>(
        `/deliveries/${deliveryId}/corrections`,
        session.access_token
      )
      setRows(data)
    } catch (err) {
      captureError(err, 'CorrectionHistoryPanel.fetch')
      setError(t('correction.error.generic'))
    } finally {
      setLoading(false)
    }
  }, [deliveryId, session?.access_token, t])

  useEffect(() => {
    if (open) {
      void fetchRows()
    } else {
      setRows([])
      setError(null)
    }
  }, [open, fetchRows])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg max-w-lg w-full mx-4 shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">
            {t('correction.history.title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="text-sm text-gray-500">{t('common.loading')}</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500">{t('correction.history.empty')}</div>
          ) : (
            rows.map((row) => {
              const fieldLabel = KNOWN_FIELDS.has(row.field)
                ? t(`correction.field.${row.field}`)
                : row.field
              const when = (() => {
                const parsed = new Date(row.created_at)
                if (Number.isNaN(parsed.getTime())) return row.created_at
                return parsed.toLocaleString()
              })()
              const actorLabel = `${row.actor_role || '?'} (${shortId(row.actor_user_id)})`
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-gray-500">
                    <span>{when}</span>
                    <span>
                      {t('correction.history.actor')}: {actorLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {fieldLabel}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    {t('correction.history.from')}{' '}
                    <span className="font-mono">{formatValue(row.old_value)}</span>{' '}
                    {t('correction.history.to')}{' '}
                    <span className="font-mono">{formatValue(row.new_value)}</span>
                  </div>
                  {row.reason && (
                    <div className="mt-2 text-xs text-gray-600">
                      <span className="font-semibold">
                        {t('correction.history.reason')}:
                      </span>{' '}
                      {row.reason}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div className="border-t px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
