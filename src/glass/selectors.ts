/**
 * Screen router wiring — maps screen names to screen definitions.
 *
 * Navigation flow:
 *   nearby → briefing → deals → comms → tasks
 *     ↕                   ↑
 *   appointments ─────────┘
 */
import { createGlassScreenRouter } from 'even-toolkit/glass-screen-router'
import type { Snapshot, Actions } from './shared'
import { nearbyScreen } from './screens/nearby'
import { homeScreen } from './screens/home'
import { briefingScreen } from './screens/briefing'
import { dealsScreen } from './screens/deals'
import { commsScreen } from './screens/comms'
import { tasksScreen } from './screens/tasks'

export const { toDisplayData, onGlassAction } = createGlassScreenRouter<Snapshot, Actions>(
  {
    nearby: nearbyScreen,
    appointments: homeScreen,
    briefing: briefingScreen,
    deals: dealsScreen,
    comms: commsScreen,
    tasks: tasksScreen,
  },
  'nearby'  // Default screen = nearby customers
)
