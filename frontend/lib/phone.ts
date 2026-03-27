export const normalizePhone = (value: string) => {
    const cleaned = value.replace(/\s+/g, '')
    if (!cleaned) return ''
    if (cleaned.startsWith('+')) return cleaned
    if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
    if (cleaned.startsWith('0')) return `+41${cleaned.slice(1)}`
    if (cleaned.startsWith('41')) return `+${cleaned}`
    return cleaned
}

export const isValidSwissPhone = (value: string) => {
    if (!value) return true
    if (!value.startsWith('+41')) return false
    const digits = value.replace(/\D/g, '')
    return digits.length === 11
}

export const formatSwissPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (!digits) return ''
    let rest = ''
    if (digits.startsWith('41')) {
        rest = digits.slice(2)
    } else if (digits.startsWith('0')) {
        rest = digits.slice(1)
    } else {
        rest = digits
    }
    rest = rest.slice(0, 9)
    const seg1 = rest.slice(0, 2)
    const seg2 = rest.slice(2, 5)
    const seg3 = rest.slice(5, 7)
    const seg4 = rest.slice(7, 9)
    let formatted = '+41'
    if (seg1) formatted += ` ${seg1}`
    if (seg2) formatted += ` ${seg2}`
    if (seg3) formatted += ` ${seg3}`
    if (seg4) formatted += ` ${seg4}`
    return formatted
}
