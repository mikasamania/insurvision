/**
 * Communications history screen for a customer.
 * Shows recent emails, calls, WhatsApp, notes.
 * Tap = no-op. Double-tap = back to briefing.
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { glassHeader, line } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { formatDate } from '../../utils/formatter'
import { truncate } from '../../utils/truncate'

const MAX_VISIBLE = 6

const TYPE_ICONS: Record<string, string> = {
  email: '✉',
  phone: '☎',
  whatsapp: 'WA',
  note: '✎',
  letter: '✉',
  sms: 'SMS',
}

export const commsScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const lines = [...glassHeader('KOMMUNIKATION')]
    const comms = snapshot.communications

    if (comms.length === 0) {
      lines.push(line('Keine Kommunikation', 'meta'))
      lines.push(line('DblTap=Zurück', 'meta'))
      return { lines }
    }

    const listLines = buildScrollableList({
      items: comms,
      highlightedIndex: nav.highlightedIndex,
      maxVisible: MAX_VISIBLE,
      formatter: (c) => {
        const icon = TYPE_ICONS[c.type] || '•'
        const dir = c.direction === 'inbound' ? '←' : '→'
        const date = formatDate(c.date)
        const subj = c.subject || c.preview || '–'
        return truncate(`${icon}${dir} ${date} ${subj}`, 44)
      },
    })

    lines.push(...listLines)
    lines.push(line('DblTap=Zurück', 'meta'))

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
            Math.max(0, snapshot.communications.length - 1)
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
        ctx.navigate('deals')
        return { ...nav, highlightedIndex: 0 }
    }
  },
}
