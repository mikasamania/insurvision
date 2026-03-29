/**
 * Main glasses controller — connects EvenHubBridge with screen router.
 * Manages snapshot state, renders display lines, and handles events.
 *
 * Boot sequence:
 * 1. Init bridge + show splash
 * 2. Request GPS location
 * 3. Load nearby customers (if GPS available) OR fall back to appointments
 * 4. Hand off to screen router
 */
import { EvenHubBridge } from 'even-toolkit/bridge'
import type { GlassNavState, DisplayData, GlassAction } from 'even-toolkit'
import type { EvenHubEvent } from '@evenrealities/even_hub_sdk'

import { toDisplayData, onGlassAction } from './selectors'
import type { Snapshot, Actions } from './shared'
import { createEmptySnapshot } from './shared'
import {
  getNextAppointments,
  getContactBriefing,
  getContactDeals,
  getContactTasks,
  getContactCommunications,
  getProviderInfo,
  getPreparedBriefing,
  getNearbyCustomers,
} from '../api/client'

function renderLinesToText(display: DisplayData): string {
  return display.lines
    .map((l) => {
      if (l.style === 'separator') return '────────────────────────────'
      const prefix = l.inverted ? '▸ ' : '  '
      return prefix + l.text
    })
    .join('\n')
}

/** Request GPS position from the phone */
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000, // Cache for 5 minutes
    })
  })
}

export class AppGlasses {
  private bridge: EvenHubBridge
  private snapshot: Snapshot
  private nav: GlassNavState
  private actions: Actions
  private currentContactId: string | null = null

  constructor() {
    this.bridge = new EvenHubBridge()
    this.snapshot = createEmptySnapshot()
    this.nav = { highlightedIndex: 0, screen: 'nearby' }

    this.actions = {
      navigate: (screen: string) => {
        this.nav = { ...this.nav, screen, highlightedIndex: 0 }
        this.render()
      },

      loadBriefing: async (contactId: string) => {
        this.currentContactId = contactId
        // Clear previous customer data
        this.snapshot.deals = []
        this.snapshot.tasks = []
        this.snapshot.communications = []
        try {
          try {
            this.snapshot.briefing = await getPreparedBriefing(contactId)
          } catch {
            this.snapshot.briefing = await getContactBriefing(contactId)
          }
        } catch (e) {
          console.error('Failed to load briefing:', e)
        }
        this.render()
      },

      loadDeals: async (contactId: string) => {
        try {
          const res = await getContactDeals(contactId)
          this.snapshot.deals = res.deals
        } catch (e) {
          console.error('Failed to load deals:', e)
        }
        this.render()
      },

      loadTasks: async (contactId: string) => {
        try {
          const res = await getContactTasks(contactId)
          this.snapshot.tasks = res.tasks
        } catch (e) {
          console.error('Failed to load tasks:', e)
        }
        this.render()
      },

      loadCommunications: async (contactId: string) => {
        try {
          const res = await getContactCommunications(contactId)
          this.snapshot.communications = res.communications
        } catch (e) {
          console.error('Failed to load comms:', e)
        }
        this.render()
      },

      refreshNearby: async () => {
        await this.loadNearbyCustomers()
        this.render()
      },
    }
  }

  async init(): Promise<void> {
    await this.bridge.init()
    await this.bridge.setupTextPage()

    // Splash
    await this.bridge.showTextPage(
      '  INSURVISION\n' +
      '  Smart Glasses CRM\n' +
      '────────────────────────────\n' +
      '  Initialisiere...'
    )

    // Register event handler — bypass even-toolkit debounce, map directly
    // G2 OsEventTypeList: CLICK=0, SCROLL_TOP=1, SCROLL_BOTTOM=2, DOUBLE_CLICK=3,
    //   FOREGROUND_ENTER=4, FOREGROUND_EXIT=5, ABNORMAL_EXIT=6, SYSTEM_EXIT=7, IMU=8
    this.bridge.onEvent((event: EvenHubEvent) => {
      const raw = event as any
      const ev = raw?.textEvent ?? raw?.listEvent ?? raw?.sysEvent
      if (!ev) return

      const et = ev.eventType

      // Skip non-input events
      if (typeof et === 'number' && et >= 4) return

      // Map directly without debounce — the G2 hardware already debounces
      let action: GlassAction | null = null
      if (et === 0 || et === undefined || et === null) {
        action = { type: 'SELECT_HIGHLIGHTED' }
      } else if (et === 1) {
        action = { type: 'HIGHLIGHT_MOVE', direction: 'up' }
      } else if (et === 2) {
        action = { type: 'HIGHLIGHT_MOVE', direction: 'down' }
      } else if (et === 3) {
        action = { type: 'GO_BACK' }
      }

      if (action) {
        console.log('[IV]', action.type, 'scr:', this.nav.screen, 'idx:', this.nav.highlightedIndex)
        this.nav = onGlassAction(action, this.nav, this.snapshot, this.actions)
        this.render()
      }
    })

    // Load provider info
    const providerRes = await getProviderInfo().catch(() => ({
      provider: 'unknown',
      features: { has_insurance_data: false, has_commission_data: false, currency: 'EUR' },
    }))
    this.snapshot.provider = providerRes.provider
    this.snapshot.isInsurance = providerRes.provider === 'insurcrm'

    // Try GPS → nearby customers (primary), fall back to appointments
    await this.bridge.updateText(
      '  INSURVISION\n' +
      '  Smart Glasses CRM\n' +
      '────────────────────────────\n' +
      '  Standort wird ermittelt...'
    )

    const hasLocation = await this.loadNearbyCustomers()

    // Also load appointments in parallel
    try {
      const aptRes = await getNextAppointments(10)
      this.snapshot.appointments = aptRes.appointments
    } catch (e) {
      console.error('Failed to load appointments:', e)
    }

    this.snapshot.loading = false

    // Start on the right screen
    if (hasLocation && this.snapshot.nearbyCustomers.length > 0) {
      this.nav.screen = 'nearby'
    } else {
      this.nav.screen = 'appointments'
    }

    // Brief connected confirmation
    const count = this.snapshot.nearbyCustomers.length || this.snapshot.appointments.length
    await this.bridge.updateText(
      '  INSURVISION ✓\n' +
      `  ${providerRes.provider.toUpperCase()}\n` +
      `  ${count} Einträge geladen\n` +
      `  ${this.nav.screen === 'nearby' ? 'Kunden in der Nähe' : 'Termine'}`
    )

    await new Promise((r) => setTimeout(r, 1200))
    this.render()
  }

  private async loadNearbyCustomers(): Promise<boolean> {
    try {
      const pos = await getCurrentPosition()
      const { latitude, longitude } = pos.coords

      const res = await getNearbyCustomers(latitude, longitude, 25, 15)
      this.snapshot.nearbyCustomers = res.customers
      this.snapshot.locationError = null
      return true
    } catch (e) {
      console.log('Location unavailable:', e)
      this.snapshot.locationError = e instanceof Error ? e.message : 'Standort nicht verfügbar'
      return false
    }
  }

  private render(): void {
    const display = toDisplayData(this.snapshot, this.nav)
    const text = renderLinesToText(display)
    this.bridge.updateText(text).catch(console.error)
  }
}
