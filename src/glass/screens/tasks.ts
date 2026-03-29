/**
 * Tasks/Reminders list screen.
 * Tap = no-op. Double-tap = back to deals.
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { glassHeader, line } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { formatDate, priorityIcon } from '../../utils/formatter'
import { truncate } from '../../utils/truncate'

const MAX_VISIBLE = 6

export const tasksScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const isIns = snapshot.isInsurance
    const label = isIns ? 'WIEDERVORLAGEN' : 'TASKS'
    const lines = [...glassHeader(label)]

    if (snapshot.tasks.length === 0) {
      lines.push(line(isIns ? 'Keine offenen WV' : 'Keine offenen Tasks', 'meta'))
      lines.push(line('DblTap=Zurück', 'meta'))
      return { lines }
    }

    const listLines = buildScrollableList({
      items: snapshot.tasks,
      highlightedIndex: nav.highlightedIndex,
      maxVisible: MAX_VISIBLE,
      formatter: (t) => {
        const prio = priorityIcon(t.priority)
        const date = formatDate(t.due_date)
        return truncate(`${date} ${t.title} ${prio}`, 44)
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
            Math.max(0, snapshot.tasks.length - 1)
          ),
        }
      case 'SELECT_HIGHLIGHTED':
        return nav // No deeper navigation
      case 'GO_BACK':
        ctx.navigate('comms')
        return { ...nav, highlightedIndex: 0 }
    }
  },
}
