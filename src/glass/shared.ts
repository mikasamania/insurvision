/**
 * Shared snapshot and context types for all InsurVision glass screens.
 */
import type {
  VisionAppointment,
  VisionContactBriefing,
  VisionDeal,
  VisionTask,
  NearbyCustomer,
  VisionCommunication,
} from '../types/api'

/** App-level state snapshot passed to every screen */
export interface Snapshot {
  provider: string
  isInsurance: boolean
  // Location
  nearbyCustomers: NearbyCustomer[]
  locationError: string | null
  // Appointments
  appointments: VisionAppointment[]
  // Selected customer data
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  communications: VisionCommunication[]
  // UI state
  loading: boolean
  error: string | null
}

/** Side-effect context passed to screen action handlers */
export interface Actions {
  navigate(screen: string): void
  loadBriefing(contactId: string): Promise<void>
  loadDeals(contactId: string): Promise<void>
  loadTasks(contactId: string): Promise<void>
  loadCommunications(contactId: string): Promise<void>
  refreshNearby(): Promise<void>
}

export function createEmptySnapshot(): Snapshot {
  return {
    provider: 'unknown',
    isInsurance: false,
    nearbyCustomers: [],
    locationError: null,
    appointments: [],
    briefing: null,
    deals: [],
    tasks: [],
    communications: [],
    loading: true,
    error: null,
  }
}
