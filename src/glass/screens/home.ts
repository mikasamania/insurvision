/**
 * Home screen: Appointment list with scrollable highlight navigation.
 * Tap = open briefing for highlighted appointment.
 * Double-tap = no-op (already at root).
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { glassHeader, line } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { formatTime, formatDateShort } from '../../utils/formatter'
import { truncate } from '../../utils/truncate'

const MAX_VISIBLE = 6 // 10 lines - 2 header - 2 footer hint

export const homeScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const today = formatDateShort(new Date().toISOString())
    const lines = [
      ...glassHeader(`TERMINE  ${today}`),
    ]

    if (snapshot.loading) {
      lines.push(line('Lade Termine...', 'meta'))
      return { lines }
    }

    if (snapshot.error) {
      lines.push(line(snapshot.error, 'meta'))
      return { lines }
    }

    if (snapshot.appointments.length === 0) {
      lines.push(line('Keine anstehenden Termine', 'meta'))
      return { lines }
    }

    const listLines = buildScrollableList({
      items: snapshot.appointments,
      highlightedIndex: nav.highlightedIndex,
      maxVisible: MAX_VISIBLE,
      formatter: (apt) => {
        const time = formatTime(apt.start_time)
        const name = apt.contact?.name || '–'
        return truncate(`${time} ${name} | ${apt.title}`, 44)
      },
    })

    lines.push(...listLines)

    // Footer hint
    lines.push(line('Tap=Briefing  DblTap=–', 'meta'))

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
            snapshot.appointments.length - 1
          ),
        }
      case 'SELECT_HIGHLIGHTED': {
        const apt = snapshot.appointments[nav.highlightedIndex]
        if (apt?.contact?.id) {
          ctx.loadBriefing(apt.contact.id)
          ctx.navigate('briefing')
        }
        return nav
      }
      case 'GO_BACK':
        return nav // Already at root
    }
  },
}
