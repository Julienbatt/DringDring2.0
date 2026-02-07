export function exportToCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columnLabels?: Record<string, string>
) {
  if (!rows.length) return

  const columns = Object.keys(rows[0])
  const header = columns.map((col) => columnLabels?.[col] ?? col)

  const csvContent = [
    header.join(';'),
    ...rows.map((row) =>
      columns
        .map((col) => {
          const value = row[col]
          if (value === null || value === undefined) return ''
          let strValue = String(value)
          // Security: Prevent CSV formula injection (Excel/Sheets)
          if (/^[=+\-@]/.test(strValue)) {
            strValue = "'" + strValue
          }
          return `"${strValue.replace(/"/g, '""')}"`
        })
        .join(';')
    ),
  ].join('\n')

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
