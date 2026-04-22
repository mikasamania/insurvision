/**
 * HUD Layout Helpers für die G2 Brille.
 * Inspiriert von InsurCRM G2 HUD Mockup.
 *
 * Die G2 nutzt eine LVGL-Unicode-Schrift (nicht monospace). Trotzdem
 * funktionieren Box-Drawing-Zeichen (─ ═ │) und Dots (● ◐ ○) als
 * zuverlässige visuelle Struktur. Spaltenalignment via Padding ist
 * approximativ, aber bei kurzen Labels visuell stabil.
 */

// ── Zeichen-Konstanten ──

export const DOT_FULL = '\u25CF'      // ● ok / active
export const DOT_HALF = '\u25D0'      // ◐ pending / half
export const DOT_EMPTY = '\u25CB'     // ○ inactive
export const WARN = '\u26A0'           // ⚠ warning (amber semantic)
export const TRI_UP = '\u25B2'         // ▲ critical
export const TRI_UP_EMPTY = '\u25B3'  // △ info
export const ARROW_RIGHT = '\u25B6'   // ▶ select / forward
export const ARROW_LEFT = '\u25C0'    // ◀ back
export const ARROW_SMALL = '\u203A'   // › drill-in
export const BULLET = '\u2022'         // • list
export const SEP_DOT = '\u00B7'        // · inline separator
export const RULE = '\u2500'           // ─ horizontal rule
export const RULE_BOLD = '\u2501'     // ━ bold rule
export const BAR_ACTIVE = '\u2501'    // ━ filled bar
export const BAR_INACTIVE = '\u2500'  // ─ empty bar
export const CHEVRON = '\u203A'       // ›

// ── Display-Konstanten ──

/** Approximiert: ~44 Zeichen passen auf eine Zeile bei G2 Default-Font (~12-13px) */
export const W_CHARS = 42

/** Maximale Zeilen-Anzahl für eine G2-Seite (576×288 @ ~28px line-height) */
export const MAX_LINES = 10

// ── Basis-Helpers ──

/** Rechts-ausrichten: left.padEnd(width - right.length) + right */
export function rightAlign(left: string, right: string, width = W_CHARS): string {
  const totalLen = left.length + right.length
  if (totalLen >= width) return (left + ' ' + right).slice(0, width)
  const padding = width - totalLen
  return left + ' '.repeat(padding) + right
}

/** Inline-Separator mit Mitteldot: "A · B · C" */
export function dotSep(...parts: (string | number | undefined | null | false)[]): string {
  return parts.filter((p): p is string | number => p !== undefined && p !== null && p !== false && p !== '')
    .map(String)
    .join(` ${SEP_DOT} `)
}

/** Trennlinie, Standard-Breite */
export function rule(width = W_CHARS): string {
  return RULE.repeat(width)
}

// ── Statusbar ──

/**
 * Status-Zeile: "INSUR//CRM v1.0 · G2 ● CONN    14:32"
 */
export function statusBar(appLabel = 'INSUR//VISION', connected = true): string {
  const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const conn = connected ? `G2 ${DOT_FULL} CONN` : `G2 ${DOT_EMPTY} OFF`
  return rightAlign(`${appLabel} ${SEP_DOT} ${conn}`, time, W_CHARS)
}

// ── Section Header ──

/**
 * "─── TITLE ───              right text"
 * @param title section name (wird großgeschrieben dargestellt)
 * @param right optional right-aligned info (z.B. ID, count)
 */
export function sectionHeader(title: string, right?: string): string {
  const label = `${RULE}${RULE}${RULE} ${title.toUpperCase()} ${RULE}${RULE}${RULE}`
  if (!right) return label
  return rightAlign(label, right, W_CHARS)
}

// ── 2-Spalten Grid Row ──

/**
 * Label-Paar mit Werten nebeneinander:
 *   "BERUF            EINKOMMEN"
 *   "IT-Projektleiter €72.000 p.a."
 *
 * Gibt 2 Zeilen zurück: [labelRow, valueRow]
 */
export function gridRow(
  leftLabel: string,
  leftVal: string,
  rightLabel: string,
  rightVal: string
): [string, string] {
  const COL = 22 // Spalten-Breite links
  const labels = leftLabel.toUpperCase().padEnd(COL) + rightLabel.toUpperCase()
  const values = leftVal.padEnd(COL) + rightVal
  return [labels, values]
}

// ── Stats Row (3 inline stats) ──

/**
 * "VERTRÄGE    JAHRESBEITR.    DECKUNG"
 * "   7         €4.280           68%"
 *
 * Gibt 2 Zeilen zurück: [labelRow, valueRow]
 */
export function statsRow(stats: { label: string; value: string }[]): [string, string] {
  if (stats.length === 0) return ['', '']
  const cols = Math.floor(W_CHARS / stats.length)
  const labels = stats.map(s => padCenter(s.label.toUpperCase(), cols)).join('')
  const values = stats.map(s => padCenter(s.value, cols)).join('')
  return [labels, values]
}

/** Zentrieren: padLeft + text + padRight */
export function padCenter(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  const totalPad = width - text.length
  const leftPad = Math.floor(totalPad / 2)
  const rightPad = totalPad - leftPad
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
}

// ── Contract Row ──

/**
 * "● PHV     Haftpflichtkasse    €86"
 *
 * @param status 'ok' | 'check' | 'warn'
 */
export function contractRow(
  status: 'ok' | 'check' | 'warn',
  name: string,
  insurer: string,
  value: string
): string {
  const icon = status === 'ok' ? DOT_FULL : status === 'check' ? DOT_HALF : WARN
  const left = `${icon} ${name.padEnd(8).slice(0, 8)}`
  const middle = insurer.slice(0, 20)
  return rightAlign(`${left} ${middle}`, value, W_CHARS)
}

// ── Nav Dots ──

/**
 * "● ● ○ ○ ○   Tab-Label"
 *
 * Active tab als ● / Inactive als ○
 */
export function navDots(total: number, active: number, label?: string): string {
  const dots = Array.from({ length: total }, (_, i) =>
    i === active ? DOT_FULL : DOT_EMPTY
  ).join(' ')
  return label ? `${dots}  ${label}` : dots
}

// ── Alert Boxes ──

/**
 * "▲ KRITISCH: Keine Pflegezusatz"
 * "  Fam. m. 2 Kindern · Alleinverd."
 *
 * @param level 'critical' | 'warning' | 'info'
 */
export function alertLines(
  level: 'critical' | 'warning' | 'info',
  title: string,
  detail?: string
): string[] {
  const icon = level === 'info' ? TRI_UP_EMPTY : TRI_UP
  const lines = [`${icon} ${title}`]
  if (detail) lines.push(`  ${detail}`)
  return lines
}

// ── Product Card (für Vorschläge) ──

/**
 * "► RLV Erhöhung auf €350.000"
 * "  Mehrbeitrag ca. €14/M · keine neue GP"
 */
export function productProposal(title: string, detail?: string): string[] {
  const lines = [`${ARROW_RIGHT} ${title}`]
  if (detail) lines.push(`  ${detail}`)
  return lines
}

// ── Note Row ──

/** "• Zweites Kind geboren (Sep 2025)" */
export function noteRow(text: string): string {
  return `${BULLET} ${text}`
}

// ── Tab-Bar (für Detail-Ansicht unten) ──

/**
 * Kompakter Tab-Indikator unten:
 * "[KUNDE] · Vertr · Komm · WV · Berat"
 *
 * Active Tab in Brackets, andere mit Mitteldot getrennt.
 */
export function tabBar(tabs: string[], activeIdx: number): string {
  return tabs.map((t, i) =>
    i === activeIdx ? `[${t.toUpperCase()}]` : t
  ).join(` ${SEP_DOT} `)
}
