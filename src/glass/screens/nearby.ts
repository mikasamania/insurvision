/**
 * Nearby customers screen — PRIMARY home screen.
 * Shows customers near the broker's current GPS location.
 * Tap = open customer briefing. Double-tap = switch to appointments view.
 */
import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { glassHeader, line } from 'even-toolkit'
import type { Snapshot, Actions } from '../shared'
import { truncate } from '../../utils/truncate'

const MAX_VISIBLE = 6

export const nearbyScreen: GlassScreen<Snapshot, Actions> = {
  display(snapshot, nav) {
    const nearby = snapshot.nearbyCustomers
    const lines = [...glassHeader('IN DER NÄHE')]

    if (snapshot.loading) {
      lines.push(line('Standort wird ermittelt...', 'meta'))
      return { lines }
    }

    if (snapshot.locationError) {
      lines.push(line('Standort nicht verfügbar', 'meta'))
      lines.push(line('DblTap → Termine', 'meta'))
      return { lines }
    }

    if (nearby.length === 0) {
      lines.push(line('Keine Kunden in der Nähe', 'meta'))
      lines.push(line('DblTap → Termine', 'meta'))
      return { lines }
    }

    const listLines = buildScrollableList({
      items: nearby,
      highlightedIndex: nav.highlightedIndex,
      maxVisible: MAX_VISIBLE,
      formatter: (c) => {
        const dist = c.distance_km < 1
          ? `${Math.round(c.distance_km * 1000)}m`
          : `${c.distance_km.toFixed(1)}km`
        const tasks = c.open_tasks > 0 ? ` !${c.open_tasks}` : ''
        return truncate(`${dist} ${c.name}${tasks} | ${c.city || ''}`, 44)
      },
    })

    lines.push(...listLines)
    lines.push(line('Tap=Kunde  DblTap=Termine', 'meta'))

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
            Math.max(0, snapshot.nearbyCustomers.length - 1)
          ),
        }
      case 'SELECT_HIGHLIGHTED': {
        const customer = snapshot.nearbyCustomers[nav.highlightedIndex]
        if (customer?.id) {
          ctx.loadBriefing(customer.id)
          ctx.navigate('briefing')
        }
        return { ...nav, highlightedIndex: 0 }
      }
      case 'GO_BACK':
        // Switch to appointments view
        ctx.navigate('appointments')
        return { ...nav, highlightedIndex: 0 }
    }
  },
}
