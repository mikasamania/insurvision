/**
 * Main glasses controller — connects EvenHubBridge with screen router.
 * Manages snapshot state, renders display lines, and handles events.
 */
import { EvenHubBridge } from 'even-toolkit/bridge'
import { mapGlassEvent } from 'even-toolkit/action-map'
import type { GlassNavState, DisplayData } from 'even-toolkit'
import type { EvenHubEvent } from '@evenrealities/even_hub_sdk'

import { toDisplayData, onGlassAction } from './selectors'
import type { Snapshot, Actions } from './shared'
import { createEmptySnapshot } from './shared'
import {
  getNextAppointments,
  getContactBriefing,
  getContactDeals,
  getContactTasks,
  getProviderInfo,
  getPreparedBriefing,
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

export class AppGlasses {
  private bridge: EvenHubBridge
  private snapshot: Snapshot
  private nav: GlassNavState
  private actions: Actions

  constructor() {
    this.bridge = new EvenHubBridge()
    this.snapshot = createEmptySnapshot()
    this.nav = { highlightedIndex: 0, screen: 'home' }

    this.actions = {
      navigate: (screen: string) => {
        this.nav = { ...this.nav, screen, highlightedIndex: 0 }
        this.render()
      },
      loadBriefing: async (contactId: string) => {
        try {
          // Try prepared briefing first, fall back to live
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
    }
  }

  async init(): Promise<void> {
    // Initialize bridge
    await this.bridge.init()
    await this.bridge.setupTextPage()

    // Show loading state
    await this.bridge.showTextPage(
      '  INSURVISION\n' +
      '  Smart Glasses CRM\n' +
      '────────────────────────────\n' +
      '  Lade Termine...'
    )

    // Register event handler
    this.bridge.onEvent((event: EvenHubEvent) => {
      const action = mapGlassEvent(event)
      if (action) {
        this.nav = onGlassAction(action, this.nav, this.snapshot, this.actions)
        this.render()
      }
    })

    // Load initial data
    try {
      const [providerRes, appointmentsRes] = await Promise.all([
        getProviderInfo().catch(() => ({
          provider: 'unknown',
          features: { has_insurance_data: false, has_commission_data: false, currency: 'EUR' },
        })),
        getNextAppointments(10),
      ])

      this.snapshot.provider = providerRes.provider
      this.snapshot.isInsurance = providerRes.provider === 'insurcrm'
      this.snapshot.appointments = appointmentsRes.appointments
      this.snapshot.loading = false

      // Brief connected confirmation
      await this.bridge.showTextPage(
        '  INSURVISION\n' +
        '  Verbunden ✓\n' +
        `  ${providerRes.provider.toUpperCase()}\n` +
        `  ${appointmentsRes.appointments.length} Termine geladen`
      )

      await new Promise((r) => setTimeout(r, 1500))
      this.render()
    } catch (err) {
      this.snapshot.loading = false
      this.snapshot.error =
        err instanceof Error ? err.message : 'Verbindung fehlgeschlagen'
      this.render()
    }
  }

  private render(): void {
    const display = toDisplayData(this.snapshot, this.nav)
    const text = renderLinesToText(display)
    this.bridge.updateText(text).catch(console.error)
  }
}
