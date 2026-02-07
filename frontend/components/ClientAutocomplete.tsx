'use client'

import { useEffect, useRef, useState } from 'react'

type Client = {
  id: string
  name: string
  city_name?: string | null
  address?: string | null
  postal_code?: string | null
  is_cms?: boolean | null
}

type Props = {
  clients: Client[]
  value: string
  onChange: (clientId: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function ClientAutocomplete({
  clients,
  value,
  onChange,
  placeholder = 'Rechercher un client',
  disabled = false,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedClient = clients.find((client) => client.id === value)
  const inputValue =
    query || !selectedClient ? query : `${selectedClient.name}`

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredClients = clients.filter((client) => {
    const haystack = `${client.name} ${client.city_name || ''}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        className="w-full rounded border px-2 py-1 disabled:bg-slate-100 disabled:text-slate-500"
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => {
          if (disabled) return
          setQuery(event.target.value)
          onChange('')
          setOpen(true)
        }}
        onFocus={() => {
          if (!disabled) setOpen(true)
        }}
        disabled={disabled}
      />

      {open && filteredClients.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border bg-white shadow">
          {filteredClients.map((client) => (
            <li
              key={client.id}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
              onClick={() => {
                onChange(client.id)
                setQuery('')
                setOpen(false)
              }}
            >
              <div className="font-medium">{client.name}</div>
              {client.city_name && (
                <div className="text-xs text-gray-500">
                  {client.city_name}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
