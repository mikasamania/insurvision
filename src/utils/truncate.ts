/** Truncate text to maxChars with "..." — default 40 chars for G2 display */
export function truncate(text: string | null, maxChars = 40): string {
  if (!text) return ''
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 3) + '...'
}

/** Truncate to fit one G2 display line (~40 chars) */
export function truncateLine(text: string | null): string {
  return truncate(text, 40)
}
