/**
 * Briefing screen: Contact overview with key metrics.
 * Tap = go to deals. Double-tap = back to home.
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { glassHeader, line, separator } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { formatCurrency, formatDate, formatAge } from '../../utils/formatter'

export const briefingScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const b = snapshot.briefing
    if (!b) {
      return { lines: [...glassHeader('BRIEFING'), line('Lade...', 'meta')] }
    }

    const c = b.contact
    const isIns = snapshot.isInsurance

    // Header: Name + category
    const catTag = c.category ? ` [${c.category}]` : ''
    const age = c.custom_fields?.birth_date
      ? formatAge(c.custom_fields.birth_date)
      : null
    const agePart = age ? `, ${age}J` : ''

    const lines = [
      ...glassHeader(`${c.name}${agePart}${catTag}`),
    ]

    // Company / job title
    if (c.company) lines.push(line(c.company, 'meta'))
    if (c.phone) lines.push(line(c.phone, 'meta'))

    lines.push(separator())

    // Deals/contracts summary
    const dealsLabel = isIns ? 'Verträge' : 'Deals'
    const valueLabel = isIns ? 'Jahresbeitr.' : 'Volumen'
    lines.push(line(`${b.deals.total} ${dealsLabel}  ${formatCurrency(b.deals.total_value)} ${valueLabel}`))

    // Tasks + tickets
    const taskLabel = isIns ? 'WV' : 'Tasks'
    const ticketLabel = isIns ? 'Schäden' : 'Tickets'
    lines.push(line(`${b.open_tasks} ${taskLabel}  ${b.open_tickets} ${ticketLabel}`))

    // Insurance bonus: commission
    if (isIns && b.insurance?.annual_commission) {
      lines.push(line(`Courtage: ${formatCurrency(b.insurance.annual_commission)}/J`, 'meta'))
    }

    // Last interaction
    if (b.last_interaction) {
      lines.push(line(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`, 'meta'))
    }

    // Footer
    lines.push(line('Tap=Verträge  DblTap=Zurück', 'meta'))

    return { lines }
  },

  action(action, nav, snapshot, ctx) {
    switch (action.type) {
      case 'SELECT_HIGHLIGHTED': {
        const contactId = snapshot.briefing?.contact?.id
        if (contactId) {
          ctx.loadDeals(contactId)
          ctx.navigate('deals')
        }
        return nav
      }
      case 'GO_BACK':
        ctx.navigate('home')
        return { ...nav, highlightedIndex: 0 }
      case 'HIGHLIGHT_MOVE':
        return nav // No scrolling on briefing
    }
  },
}
