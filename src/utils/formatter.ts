/** Format date as "31.03.2026" */
export function formatDate(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Format date as short "Mo 31.03." */
export function formatDateShort(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' })
  const day = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  return `${weekday} ${day}`
}

/** Format time as "10:00" */
export function formatTime(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/** Format currency German style: "4.250 €" */
export function formatCurrency(amount: number): string {
  if (amount === 0) return '0 €'
  return (
    new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount) + ' €'
  )
}

/** Calculate age from birth date */
export function formatAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const dob = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

/** Priority to symbol */
export function priorityIcon(p: string): string {
  switch (p) {
    case 'urgent': return '!!!'
    case 'high': return '!!'
    case 'medium': return '!'
    default: return ''
  }
}
