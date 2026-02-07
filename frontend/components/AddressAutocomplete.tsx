'use client'

import { useState, useEffect, useRef } from 'react'


// Simple debounce implementation if lodash not available/wanted heavy dep
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value)
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)
        return () => {
            clearTimeout(handler)
        }
    }, [value, delay])
    return debouncedValue
}

type SwisstopoResult = {
    id: number
    weight: number
    attrs: {
        label: string
        origin: string
        x: number
        y: number
    }
}

type Address = {
    street: string
    number: string
    zip: string
    city: string
    canton?: string
    lat?: number
    lng?: number
}

type Props = {
    onSelect: (address: Address) => void
    disabled?: boolean
}

// Safe rendering of bold tags
const HighlightedLabel = ({ label }: { label: string }) => {
    // Split by <b> and </b>
    const parts = label.split(/(<b>|<\/b>)/g)
    return (
        <span>
            {parts.map((part, i) => {
                if (part === '<b>' || part === '</b>') return null
                // Check if the previous part was <b> -> this part is bold
                // But simplified: <b>text</b> -> ["", "<b>", "text", "</b>", ""]
                const isBold = parts[i - 1] === '<b>'
                return isBold ? (
                    <strong key={i} className="font-semibold text-gray-900">
                        {part}
                    </strong>
                ) : (
                    <span key={i} className="text-gray-700">
                        {part}
                    </span>
                )
            })}
        </span>
    )
}

const swissToWgs84 = (easting: number, northing: number) => {
    const isLv03 = easting < 1000000
    const y = (easting - (isLv03 ? 600000 : 2600000)) / 1000000
    const x = (northing - (isLv03 ? 200000 : 1200000)) / 1000000

    let lon =
        2.6779094 +
        4.728982 * y +
        0.791484 * y * x +
        0.1306 * y * x * x -
        0.0436 * y * y * y
    let lat =
        16.9023892 +
        3.238272 * x -
        0.270978 * y * y -
        0.002528 * x * x -
        0.0447 * y * y * x -
        0.0140 * x * x * x

    lon = (lon * 100.0) / 36.0
    lat = (lat * 100.0) / 36.0
    return { lat, lng: lon }
}

export default function AddressAutocomplete({ onSelect, disabled }: Props) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SwisstopoResult[]>([])
    const [isOpen, setIsOpen] = useState(false)

    // Use debounced query for API calls
    const debouncedQuery = useDebounce(query, 300)
    const shouldSearch = debouncedQuery.trim().length >= 3
    const wrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!shouldSearch) {
            return
        }

        // api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&searchText=...&origins=address
        fetch(`https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&searchText=${encodeURIComponent(debouncedQuery)}&origins=address`)
            .then(res => res.json())
            .then(data => {
                setResults(data.results || [])
                setIsOpen(true)
            })
            .catch(err => {
                console.error("Swisstopo error", err)
            })
    }, [debouncedQuery, shouldSearch])

    // Parse "<b>Avenue de la Gare</b> 1, 1950 Sion"
    const parseLabel = (htmlLabel: string): Address => {
        // Remove HTML tags
        const cleanLabel = htmlLabel.replace(/<[^>]*>?/gm, '')
        // Expected format: "Street Number, ZIP City"
        // Regex strategy:
        // Try to split by first comma
        const parts = cleanLabel.split(',')

        let street = ''
        let number = ''
        let zip = ''
        let city = ''

        if (parts.length >= 2) {
            // "Avenue de la Gare 1"
            const streetPart = parts[0].trim()
            // "1950 Sion" (rest joined back if multiple commas?)
            const cityPart = parts.slice(1).join(',').trim()

            // Parse street part: look for the last number
            // This is tricky: "Rue 23 Juin 5" vs "Grand-Rue 10"
            // Usually the number is at the end.
            const matchNumber = streetPart.match(/^(.*)\s+(\d+[a-zA-Z]*)$/)
            if (matchNumber) {
                street = matchNumber[1].trim()
                number = matchNumber[2].trim()
            } else {
                street = streetPart
            }

            // Parse city part: "1950 Sion"
            const matchCity = cityPart.match(/^(\d{4})\s+(.+)$/)
            if (matchCity) {
                zip = matchCity[1]
                city = matchCity[2]
            } else {
                city = cityPart
            }
        } else {
            // Fallback for labels without comma: "Rue des Sémaphores 3b 1950 Sion"
            const matchNoComma = cleanLabel.match(/^(.*)\s(\d{4})\s(.+)$/)
            if (matchNoComma) {
                const streetPart = matchNoComma[1].trim()
                zip = matchNoComma[2]
                city = matchNoComma[3]
                const matchNumber = streetPart.match(/^(.*)\s+(\d+[a-zA-Z]*)$/)
                if (matchNumber) {
                    street = matchNumber[1].trim()
                    number = matchNumber[2].trim()
                } else {
                    street = streetPart
                }
            } else {
                street = cleanLabel
            }
        }

        return { street, number, zip, city }
    }

    const formatAddress = (address: Address) => {
        const line1 = [address.street, address.number].filter(Boolean).join(' ').trim()
        const line2 = [address.zip, address.city].filter(Boolean).join(' ').trim()
        return [line1, line2].filter(Boolean).join(', ')
    }

    const handleSelect = (result: SwisstopoResult) => {
        const address = parseLabel(result.attrs.label)
        if (typeof result.attrs.x === 'number' && typeof result.attrs.y === 'number') {
            const coords = swissToWgs84(result.attrs.y, result.attrs.x)
            address.lat = coords.lat
            address.lng = coords.lng
        }
        setQuery(formatAddress(address))
        setIsOpen(false)
        onSelect(address)
    }

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <input
                    type="text"
                    className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                    placeholder="Rechercher une adresse (ex: Rue du Rho...)"
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value)
                        const nextShouldSearch = e.target.value.trim().length >= 3
                        setIsOpen(nextShouldSearch)
                    }}
                    disabled={disabled}
                />
            </div>

            {isOpen && shouldSearch && results.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-auto">
                    {results.map((result) => (
                        <li
                            key={result.id}
                            className="px-3 py-2 cursor-pointer hover:bg-emerald-50 text-sm"
                            onClick={() => handleSelect(result)}
                        >
                            <HighlightedLabel label={result.attrs.label} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
