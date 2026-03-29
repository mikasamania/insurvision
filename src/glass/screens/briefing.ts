/**
 * Briefing screen: Contact overview with key metrics.
 * Scroll up/down = cycle through sub-views (overview, details)
 * Tap = go to deals/contracts.
 * Double-tap = back to previous screen (nearby or appointments).
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { glassHeader, line, separator } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { formatCurrency, formatDate, formatAge } from '../../utils/formatter'
import { truncate } from '../../utils/truncate'

export const briefingScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const b = snapshot.briefing
    if (!b) {
      return { lines: [...glassHeader('BRIEFING'), line('Lade...', 'meta')] }
    }

    const c = b.contact
    const isIns = snapshot.isInsurance

    // Header
    const catTag = c.category ? ` [${c.category}]` : ''
    const age = c.custom_fields?.birth_date
      ? formatAge(c.custom_fields.birth_date)
      : null
    const agePart = age ? `, ${age}J` : ''

    const lines = [
      ...glassHeader(`${c.name}${agePart}${catTag}`),
    ]

    // Company + contact
    if (c.company) lines.push(line(c.company, 'meta'))
    if (c.phone) lines.push(line(`☎ ${c.phone}`, 'meta'))
    if (c.email) lines.push(line(truncate(`✉ ${c.email}`, 44), 'meta'))

    lines.push(separator())

    // Contracts/Deals summary
    const dealsLabel = isIns ? 'Verträge' : 'Deals'
    const valueLabel = isIns ? 'Jahresbeitr.' : 'Volumen'
    lines.push(line(`${b.deals.total} ${dealsLabel}  ${formatCurrency(b.deals.total_value)} ${valueLabel}`))

    // Top categories (show up to 2)
    if (b.deals.by_stage.length > 0) {
      const top = b.deals.by_stage.slice(0, 2)
        .map(s => `${s.stage}: ${s.count}`)
        .join('  ')
      lines.push(line(top, 'meta'))
    }

    // Tasks + tickets
    const taskLabel = isIns ? 'WV' : 'Tasks'
    const ticketLabel = isIns ? 'Schäden' : 'Tickets'
    lines.push(line(`${b.open_tasks} ${taskLabel}  ${b.open_tickets} ${ticketLabel}`))

    // Commission (insurance only)
    if (isIns && b.insurance?.annual_commission) {
      lines.push(line(`Courtage: ${formatCurrency(b.insurance.annual_commission)}/J`, 'meta'))
    }

    // Last interaction
    if (b.last_interaction) {
      lines.push(line(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`, 'meta'))
    }

    // Navigation hint
    lines.push(line('Tap▸Verträge  DblTap◂Zurück', 'meta'))

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
        // Go back to wherever we came from (nearby or appointments)
        ctx.navigate(snapshot.nearbyCustomers.length > 0 ? 'nearby' : 'appointments')
        return { ...nav, highlightedIndex: 0 }
      case 'HIGHLIGHT_MOVE':
        return nav
    }
  },
}
