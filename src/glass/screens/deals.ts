/**
 * Deals/Contracts list screen.
 * Tap = go to tasks. Double-tap = back to briefing.
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { glassHeader, line } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { formatCurrency } from '../../utils/formatter'
import { truncate } from '../../utils/truncate'

const MAX_VISIBLE = 6

export const dealsScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const isIns = snapshot.isInsurance
    const label = isIns ? 'VERTRÄGE' : 'DEALS'
    const lines = [...glassHeader(label)]

    if (snapshot.deals.length === 0) {
      lines.push(line(isIns ? 'Keine Verträge' : 'Keine Deals', 'meta'))
      lines.push(line('DblTap=Zurück', 'meta'))
      return { lines }
    }

    const listLines = buildScrollableList({
      items: snapshot.deals,
      highlightedIndex: nav.highlightedIndex,
      maxVisible: MAX_VISIBLE,
      formatter: (d) => {
        if (isIns) {
          // "KFZ Allianz | 650 €/J"
          return truncate(
            `${d.category || d.name} ${d.insurer || ''} | ${formatCurrency(d.value)}/J`,
            44
          )
        }
        // "Deal Name | 12.500 € [Won]"
        return truncate(`${d.name} | ${formatCurrency(d.value)} [${d.stage}]`, 44)
      },
    })

    lines.push(...listLines)
    lines.push(line('Tap=Tasks  DblTap=Zurück', 'meta'))

    return { lines }
  },

  action(action, nav, snapshot, ctx) {
    switch (action.type) {
      case 'HIGHLIGHT_MOVE':
        return {
          ...nav,
          highlightedIndex: moveHighlight(
            nav.highlightedIndex,
            action.direction,
            Math.max(0, snapshot.deals.length - 1)
          ),
        }
      case 'SELECT_HIGHLIGHTED': {
        const contactId = snapshot.briefing?.contact?.id
        if (contactId) {
          ctx.loadTasks(contactId)
          ctx.navigate('tasks')
        }
        return { ...nav, highlightedIndex: 0 }
      }
      case 'GO_BACK':
        ctx.navigate('briefing')
        return { ...nav, highlightedIndex: 0 }
    }
  },
}
