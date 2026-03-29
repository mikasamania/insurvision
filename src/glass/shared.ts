/**
 * Shared snapshot and context types for all InsurVision glass screens.
 */
import type {
  VisionAppointment,
  VisionContactBriefing,
  VisionDeal,
  VisionTask,
} from '../types/api'

/** App-level state snapshot passed to every screen */
export interface Snapshot {
  provider: string
  isInsurance: boolean
  appointments: VisionAppointment[]
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  loading: boolean
  error: string | null
}

/** Side-effect context passed to screen action handlers */
export interface Actions {
  navigate(screen: string): void
  loadBriefing(contactId: string): Promise<void>
  loadDeals(contactId: string): Promise<void>
  loadTasks(contactId: string): Promise<void>
}

export function createEmptySnapshot(): Snapshot {
  return {
    provider: 'unknown',
    isInsurance: false,
    appointments: [],
    briefing: null,
    deals: [],
    tasks: [],
    loading: true,
    error: null,
  }
}
