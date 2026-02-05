'use client'

import { cn } from '@/lib/utils'

type Status =
  | 'unassigned'
  | 'assigned'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'issue'

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  unassigned: {
    label: 'Non assignée',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  assigned: {
    label: 'En cours',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  picked_up: {
    label: 'Collecte',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  delivered: {
    label: 'Livrée',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  cancelled: {
    label: 'Annulée',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  issue: {
    label: 'Incident',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
}

export function StatusBadge({
  status,
  className,
  size = 'sm',
}: {
  status: Status
  className?: string
  size?: 'sm' | 'xs'
}) {
  const style = STATUS_STYLES[status]
  const sizeClass = size === 'xs' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-0.5'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        sizeClass,
        style.className,
        className
      )}
    >
      {style.label}
    </span>
  )
}
