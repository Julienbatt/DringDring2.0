import * as React from 'react'
import { Calendar } from 'lucide-react'

import { cn } from '@/lib/utils'

type MonthInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  wrapperClassName?: string
  pickerAriaLabel?: string
}

function MonthInput({ className, wrapperClassName, pickerAriaLabel, ...props }: MonthInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const openPicker = () => {
    const el = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
    if (!el) return
    el.focus()
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
    el.click()
  }

  return (
    <div className={cn('relative', wrapperClassName)}>
      <input
        ref={inputRef}
        type="month"
        data-slot="month-input"
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 pr-10 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          className
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
        aria-label={pickerAriaLabel}
      >
        <Calendar className="h-4 w-4" />
      </button>
    </div>
  )
}

export { MonthInput }
