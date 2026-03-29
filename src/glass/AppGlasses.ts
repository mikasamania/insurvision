/**
 * InsurVision G2 Glasses Controller
 *
 * Uses native G2 SDK directly (rebuildPageContainer + ListContainer)
 * for firmware-managed scroll highlighting on lists.
 *
 * Screens:
 *   nearby   → native list of customers sorted by GPS distance
 *   appointments → native list of upcoming tasks/appointments
 *   briefing → text detail view for a customer
 *   deals    → native list of contracts/deals
 *   comms    → native list of recent communications
 *   tasks    → native list of open tasks/reminders
 */
import {
  RebuildPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  ImageContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { EvenHubBridge } from 'even-toolkit/bridge'

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
import type {
  VisionAppointment,
  VisionContactBriefing,
  VisionDeal,
  VisionTask,
  VisionCommunication,
  NearbyCustomer,
  ProviderInfo,
} from '../types/api'
import { formatTime, formatDate, formatCurrency, formatAge, priorityIcon } from '../utils/formatter'
import { truncate } from '../utils/truncate'

type Screen = 'nearby' | 'appointments' | 'briefing' | 'deals' | 'comms' | 'tasks'

interface State {
  screen: Screen
  provider: string
  isInsurance: boolean
  nearbyCustomers: NearbyCustomer[]
  appointments: VisionAppointment[]
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  comms: VisionCommunication[]
  locationError: string | null
  selectedContactId: string | null
}

/** Request GPS position */
function getGPS(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No GPS'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 300000,
    })
  })
}

export class AppGlasses {
  private bridge: EvenHubBridge
  private raw: EvenAppBridge | null = null
  private state: State

  constructor() {
    this.bridge = new EvenHubBridge()
    this.state = {
      screen: 'nearby',
      provider: 'unknown',
      isInsurance: false,
      nearbyCustomers: [],
      appointments: [],
      briefing: null,
      deals: [],
      tasks: [],
      comms: [],
      locationError: null,
      selectedContactId: null,
    }
  }

  async init(): Promise<void> {
    await this.bridge.init()
    this.raw = this.bridge.rawBridge

    // Show splash
    await this.showText('  INSURVISION\n  Smart Glasses CRM\n────────────────────────────\n  Initialisiere...')

    // Register events
    this.bridge.onEvent((event: EvenHubEvent) => this.handleEvent(event))

    // Load provider info
    const info = await getProviderInfo().catch((): ProviderInfo => ({
      provider: 'unknown', features: { has_insurance_data: false, has_commission_data: false, currency: 'EUR' },
    }))
    this.state.provider = info.provider
    this.state.isInsurance = info.provider === 'insurcrm'

    // Load GPS + nearby customers
    await this.showText('  INSURVISION\n  Standort wird ermittelt...')
    let hasLocation = false
    try {
      const pos = await getGPS()
      const res = await getNearbyCustomers(pos.coords.latitude, pos.coords.longitude, 25, 15)
      this.state.nearbyCustomers = res.customers
      hasLocation = true
    } catch (e) {
      this.state.locationError = e instanceof Error ? e.message : 'GPS nicht verfügbar'
    }

    // Load appointments in parallel
    try {
      const res = await getNextAppointments(10)
      this.state.appointments = res.appointments
    } catch {}

    // Show appropriate start screen
    if (hasLocation && this.state.nearbyCustomers.length > 0) {
      this.state.screen = 'nearby'
    } else {
      this.state.screen = 'appointments'
    }

    await this.render()
  }

  // ── Event Handling ──

  private handleEvent(event: EvenHubEvent): void {
    const raw = event as any
    const listEv = raw?.listEvent
    const textEv = raw?.textEvent

    // List events have currentSelectItemIndex
    if (listEv) {
      const et = listEv.eventType
      const selectedIdx = listEv.currentSelectItemIndex

      console.log('[IV] listEvent et:', et, 'idx:', selectedIdx, 'scr:', this.state.screen)

      if (typeof et === 'number' && et >= 4) return // system events

      if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null) {
        this.onListSelect(selectedIdx ?? 0)
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onBack()
      }
      // Scroll is handled by firmware natively for list containers
      return
    }

    // Text events (for detail/briefing screens)
    if (textEv) {
      const et = textEv.eventType
      console.log('[IV] textEvent et:', et, 'scr:', this.state.screen)

      if (typeof et === 'number' && et >= 4) return

      if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null) {
        this.onTextTap()
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onBack()
      }
    }
  }

  private async onListSelect(itemIndex: number): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'nearby': {
        const c = s.nearbyCustomers[itemIndex]
        if (c?.id) {
          s.selectedContactId = c.id
          await this.loadAndShowBriefing(c.id)
        }
        break
      }
      case 'appointments': {
        const apt = s.appointments[itemIndex]
        if (apt?.contact?.id) {
          s.selectedContactId = apt.contact.id
          await this.loadAndShowBriefing(apt.contact.id)
        }
        break
      }
      case 'deals':
      case 'comms':
      case 'tasks':
        // No deeper navigation from these lists — just scroll
        break
    }
  }

  private async onTextTap(): Promise<void> {
    const s = this.state
    if (s.screen === 'briefing' && s.selectedContactId) {
      // Tap on briefing → show deals/contracts
      try {
        const res = await getContactDeals(s.selectedContactId)
        s.deals = res.deals
      } catch {}
      s.screen = 'deals'
      await this.render()
    }
  }

  private async onBack(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'nearby':
        s.screen = 'appointments'
        break
      case 'appointments':
        s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'
        break
      case 'briefing':
        s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'
        break
      case 'deals':
        // Load comms when going from deals
        if (s.selectedContactId) {
          try {
            const res = await getContactCommunications(s.selectedContactId)
            s.comms = res.communications
          } catch {}
        }
        s.screen = 'comms'
        break
      case 'comms':
        if (s.selectedContactId) {
          try {
            const res = await getContactTasks(s.selectedContactId)
            s.tasks = res.tasks
          } catch {}
        }
        s.screen = 'tasks'
        break
      case 'tasks':
        s.screen = 'briefing'
        break
    }
    await this.render()
  }

  // ── Load + Navigate ──

  private async loadAndShowBriefing(contactId: string): Promise<void> {
    this.state.deals = []
    this.state.tasks = []
    this.state.comms = []
    this.state.screen = 'briefing'

    // Show loading state
    await this.showText('  Lade Kundendaten...')

    try {
      try {
        this.state.briefing = await getPreparedBriefing(contactId)
      } catch {
        this.state.briefing = await getContactBriefing(contactId)
      }
    } catch (e) {
      console.error('Failed to load briefing:', e)
    }

    await this.render()
  }

  // ── Render ──

  private async render(): Promise<void> {
    switch (this.state.screen) {
      case 'nearby': await this.renderList('IN DER NÄHE', this.formatNearbyItems(), 'Tap=Kunde  DblTap=Termine'); break
      case 'appointments': await this.renderList('TERMINE', this.formatAppointmentItems(), 'Tap=Kunde  DblTap=Nähe'); break
      case 'briefing': await this.renderBriefing(); break
      case 'deals': await this.renderList(this.state.isInsurance ? 'VERTRÄGE' : 'DEALS', this.formatDealItems(), 'DblTap=Kommunikation'); break
      case 'comms': await this.renderList('KOMMUNIKATION', this.formatCommItems(), 'DblTap=Aufgaben'); break
      case 'tasks': await this.renderList(this.state.isInsurance ? 'WIEDERVORLAGEN' : 'TASKS', this.formatTaskItems(), 'DblTap=Briefing'); break
    }
  }

  // ── Native List Page (firmware scroll-highlight!) ──

  private async renderList(title: string, items: string[], footer: string): Promise<void> {
    if (!this.raw) return

    const listItems = items.slice(0, 20).map((text, i) =>
      new ListItemContainerProperty({ itemID: i, itemName: truncate(text, 64) } as any)
    )

    if (listItems.length === 0) {
      listItems.push(new ListItemContainerProperty({ itemID: 0, itemName: 'Keine Einträge' } as any))
    }

    const list = new ListContainerProperty({
      containerID: 2, containerName: 'items',
      xPosition: 0, yPosition: 36, width: 576, height: 228,
      borderWidth: 0, borderColor: 0, paddingLength: 4,
      isEventCapture: 1,
    } as any);
    (list as any).listItem = listItems

    await this.raw.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 3,
        textObject: [
          new TextContainerProperty({
            containerID: 1, containerName: 'header',
            xPosition: 0, yPosition: 0, width: 576, height: 36,
            borderWidth: 0, borderColor: 0, paddingLength: 6,
            content: `── ${title} ──`, isEventCapture: 0,
          } as any),
          new TextContainerProperty({
            containerID: 3, containerName: 'footer',
            xPosition: 0, yPosition: 264, width: 576, height: 24,
            borderWidth: 0, borderColor: 0, paddingLength: 4,
            content: footer, isEventCapture: 0,
          } as any),
        ] as any,
        listObject: [list] as any,
        imageObject: [] as any,
      })
    )
  }

  // ── Text Detail Page (briefing) ──

  private async renderBriefing(): Promise<void> {
    const b = this.state.briefing
    if (!b) {
      await this.showText('  Lade Kundendaten...')
      return
    }

    const c = b.contact
    const isIns = this.state.isInsurance
    const age = c.custom_fields?.birth_date ? formatAge(c.custom_fields.birth_date) : null

    // Build formatted briefing text
    const lines: string[] = []
    lines.push(`── KUNDE ──`)
    lines.push(`${c.name.toUpperCase()}${age ? `, ${age}J` : ''}`)
    if (c.company) lines.push(c.company)
    if (c.phone) lines.push(`☎ ${c.phone}`)

    lines.push('────────────────────────────')

    // Contracts/deals
    const dl = isIns ? 'Verträge' : 'Deals'
    const vl = isIns ? 'Jahresbeitrag' : 'Volumen'
    lines.push(`${b.deals.total} ${dl}  ${formatCurrency(b.deals.total_value)} ${vl}`)

    // Top categories
    if (b.deals.by_stage.length > 0) {
      const top = b.deals.by_stage.slice(0, 3)
        .map(s => `● ${s.stage}: ${s.count}×`)
        .join('  ')
      lines.push(top)
    }

    // Tasks + tickets
    const tl = isIns ? 'Wiedervorlagen' : 'Tasks'
    const tickl = isIns ? 'Schäden' : 'Tickets'
    lines.push(`${b.open_tasks} ${tl}  ${b.open_tickets} ${tickl}`)

    // Commission
    if (isIns && b.insurance?.annual_commission) {
      lines.push(`Courtage: ${formatCurrency(b.insurance.annual_commission)}/J`)
    }

    // Last interaction
    if (b.last_interaction) {
      lines.push(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    }

    // Category badge
    if (c.category) lines.push(`Status: ${c.category}`)
    if (c.since) lines.push(`Kunde seit ${new Date(c.since).getFullYear()}`)

    lines.push('────────────────────────────')
    lines.push('Tap ▶ Verträge   DblTap ◀ Zurück')

    await this.showText(lines.join('\n'))
  }

  // ── Format Helpers for List Items ──

  private formatNearbyItems(): string[] {
    return this.state.nearbyCustomers.map(c => {
      const dist = c.distance_km < 1
        ? `${Math.round(c.distance_km * 1000)}m`
        : `${c.distance_km.toFixed(1)}km`
      const tasks = c.open_tasks > 0 ? ` !${c.open_tasks}` : ''
      const premium = c.annual_premium > 0 ? ` ${formatCurrency(c.annual_premium)}` : ''
      return `${dist} ${c.name}${tasks}${premium}`
    })
  }

  private formatAppointmentItems(): string[] {
    return this.state.appointments.map(apt => {
      const time = formatTime(apt.start_time)
      const name = apt.contact?.name || '–'
      return `${time} ${name} | ${apt.title}`
    })
  }

  private formatDealItems(): string[] {
    return this.state.deals.map(d => {
      if (this.state.isInsurance) {
        return `● ${d.category || d.name} ${d.insurer || ''} ${formatCurrency(d.value)}/J`
      }
      return `${d.name} ${formatCurrency(d.value)} [${d.stage}]`
    })
  }

  private formatCommItems(): string[] {
    const icons: Record<string, string> = {
      email: '✉', phone: '☎', whatsapp: 'WA', note: '✎', letter: '✉', sms: 'SMS',
    }
    return this.state.comms.map(c => {
      const icon = icons[c.type] || '•'
      const dir = c.direction === 'inbound' ? '←' : '→'
      const date = formatDate(c.date)
      return `${icon}${dir} ${date} ${c.subject || c.preview || '–'}`
    })
  }

  private formatTaskItems(): string[] {
    return this.state.tasks.map(t => {
      const prio = priorityIcon(t.priority)
      const date = formatDate(t.due_date)
      return `${date} ${t.title} ${prio}`
    })
  }

  // ── Low-level helpers ──

  private async showText(content: string): Promise<void> {
    if (!this.raw) {
      // Fallback to even-toolkit bridge
      await this.bridge.showTextPage(content)
      return
    }

    await this.raw.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            containerID: 1, containerName: 'main',
            xPosition: 0, yPosition: 0, width: 576, height: 288,
            borderWidth: 0, borderColor: 0, paddingLength: 8,
            content, isEventCapture: 1,
          } as any),
        ] as any,
        listObject: [] as any,
        imageObject: [] as any,
      })
    )
  }
}
