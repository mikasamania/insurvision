/**
 * Screen router wiring — maps screen names to screen definitions.
 */
import { createGlassScreenRouter } from 'even-toolkit/glass-screen-router'
import type { Snapshot, Actions } from './shared'
import { homeScreen } from './screens/home'
import { briefingScreen } from './screens/briefing'
import { dealsScreen } from './screens/deals'
import { tasksScreen } from './screens/tasks'

export const { toDisplayData, onGlassAction } = createGlassScreenRouter<Snapshot, Actions>(
  {
    home: homeScreen,
    briefing: briefingScreen,
    deals: dealsScreen,
    tasks: tasksScreen,
  },
  'home'
)
