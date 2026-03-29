/**
 * InsurVision G2 Glasses Controller
 *
 * Uses the raw Even Hub SDK directly (no even-toolkit wrapper).
 * Flow: waitForEvenAppBridge → createStartUpPageContainer → rebuildPageContainer
 */
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk'

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
  selectedContactId: string | null
}

function getGPS(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No GPS'))
    let done = false
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('GPS timeout')) } }, 5000)
    navigator.geolocation.getCurrentPosition(
      p => { if (!done) { done = true; clearTimeout(t); resolve(p) } },
      e => { if (!done) { done = true; clearTimeout(t); reject(e) } },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }
    )
  })
}

export class AppGlasses {
  private bridge!: EvenAppBridge
  private state: State = {
    screen: 'appointments', provider: 'unknown', isInsurance: false,
    nearbyCustomers: [], appointments: [],
    briefing: null, deals: [], tasks: [], comms: [],
    selectedContactId: null,
  }

  async init(): Promise<void> {
    // 1. Get bridge
    this.bridge = await waitForEvenAppBridge()

    // 2. MANDATORY: createStartUpPageContainer before anything else
    await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            containerID: 1, containerName: 'main',
            xPosition: 0, yPosition: 0, width: 576, height: 288,
            borderWidth: 0, borderColor: 0, paddingLength: 8,
            content: '  INSURVISION\n  Smart Glasses CRM\n────────────────────────────\n  Lade Daten...',
            isEventCapture: 1,
          } as any),
        ] as any,
        imageObject: [] as any,
      })
    )

    // 3. Register events
    this.bridge.onEvenHubEvent((event: EvenHubEvent) => this.handleEvent(event))

    // 4. Load data in parallel
    let hasLocation = false
    await Promise.allSettled([
      getProviderInfo().then(info => {
        this.state.provider = info.provider
        this.state.isInsurance = info.provider === 'insurcrm'
      }),
      getGPS()
        .then(pos => getNearbyCustomers(pos.coords.latitude, pos.coords.longitude, 25, 15))
        .then(res => { this.state.nearbyCustomers = res.customers; hasLocation = true }),
      getNextAppointments(10)
        .then(res => { this.state.appointments = res.appointments }),
    ])

    // 5. Pick screen + render
    this.state.screen = (hasLocation && this.state.nearbyCustomers.length > 0) ? 'nearby' : 'appointments'
    await this.render()
  }

  // ── Events ──

  private handleEvent(event: EvenHubEvent): void {
    const raw = event as any
    const listEv = raw?.listEvent
    const textEv = raw?.textEvent

    if (listEv) {
      const et = listEv.eventType
      if (typeof et === 'number' && et >= 4) return
      if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null) {
        this.onListSelect(listEv.currentSelectItemIndex ?? 0)
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onBack()
      }
      return
    }

    if (textEv) {
      const et = textEv.eventType
      if (typeof et === 'number' && et >= 4) return
      if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null) {
        this.onTextTap()
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onBack()
      }
    }
  }

  private async onListSelect(idx: number): Promise<void> {
    if (this.state.screen === 'nearby') {
      const c = this.state.nearbyCustomers[idx]
      if (c?.id) { this.state.selectedContactId = c.id; await this.loadBriefing(c.id) }
    } else if (this.state.screen === 'appointments') {
      const a = this.state.appointments[idx]
      if (a?.contact?.id) { this.state.selectedContactId = a.contact.id; await this.loadBriefing(a.contact.id) }
    }
  }

  private async onTextTap(): Promise<void> {
    if (this.state.screen === 'briefing' && this.state.selectedContactId) {
      try { this.state.deals = (await getContactDeals(this.state.selectedContactId)).deals } catch {}
      this.state.screen = 'deals'; await this.render()
    }
  }

  private async onBack(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'nearby': s.screen = 'appointments'; break
      case 'appointments': s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'; break
      case 'briefing': s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'; break
      case 'deals':
        if (s.selectedContactId) try { s.comms = (await getContactCommunications(s.selectedContactId)).communications } catch {}
        s.screen = 'comms'; break
      case 'comms':
        if (s.selectedContactId) try { s.tasks = (await getContactTasks(s.selectedContactId)).tasks } catch {}
        s.screen = 'tasks'; break
      case 'tasks': s.screen = 'briefing'; break
    }
    await this.render()
  }

  private async loadBriefing(contactId: string): Promise<void> {
    this.state.deals = []; this.state.tasks = []; this.state.comms = []
    this.state.screen = 'briefing'
    await this.showText('  Lade Kundendaten...')
    try {
      try { this.state.briefing = await getPreparedBriefing(contactId) }
      catch { this.state.briefing = await getContactBriefing(contactId) }
    } catch {}
    await this.render()
  }

  // ── Render ──

  private async render(): Promise<void> {
    switch (this.state.screen) {
      case 'nearby': await this.showList('IN DER NÄHE', this.fmtNearby(), 'Tap=Kunde  DblTap=Termine'); break
      case 'appointments': await this.showList('TERMINE', this.fmtAppts(), 'Tap=Kunde  DblTap=Nähe'); break
      case 'briefing': await this.showBriefing(); break
      case 'deals': await this.showList(this.state.isInsurance ? 'VERTRÄGE' : 'DEALS', this.fmtDeals(), 'DblTap=Kommunikation'); break
      case 'comms': await this.showList('KOMMUNIKATION', this.fmtComms(), 'DblTap=Aufgaben'); break
      case 'tasks': await this.showList(this.state.isInsurance ? 'WIEDERVORLAGEN' : 'TASKS', this.fmtTasks(), 'DblTap=Briefing'); break
    }
  }

  // ── List Page (header + native list + footer) ──

  private async showList(title: string, items: string[], footer: string): Promise<void> {
    const listItems = items.slice(0, 20).map((text, i) =>
      new ListItemContainerProperty({ itemID: i, itemName: truncate(text, 64) } as any)
    )
    if (listItems.length === 0) {
      listItems.push(new ListItemContainerProperty({ itemID: 0, itemName: 'Keine Einträge' } as any))
    }

    const list = new ListContainerProperty({
      containerID: 2, containerName: 'items',
      xPosition: 0, yPosition: 36, width: 576, height: 228,
      borderWidth: 0, borderColor: 0, paddingLength: 4, isEventCapture: 1,
    } as any);
    (list as any).listItem = listItems

    await this.bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 3,
        textObject: [
          new TextContainerProperty({ containerID: 1, containerName: 'hdr', xPosition: 0, yPosition: 0, width: 576, height: 36, borderWidth: 0, borderColor: 0, paddingLength: 6, content: `── ${title} ──`, isEventCapture: 0 } as any),
          new TextContainerProperty({ containerID: 3, containerName: 'ftr', xPosition: 0, yPosition: 264, width: 576, height: 24, borderWidth: 0, borderColor: 0, paddingLength: 4, content: footer, isEventCapture: 0 } as any),
        ] as any,
        listObject: [list] as any,
        imageObject: [] as any,
      })
    )
  }

  // ── Text Page (briefing detail) ──

  private async showText(content: string): Promise<void> {
    await this.bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({ containerID: 1, containerName: 'main', xPosition: 0, yPosition: 0, width: 576, height: 288, borderWidth: 0, borderColor: 0, paddingLength: 8, content, isEventCapture: 1 } as any),
        ] as any,
        listObject: [] as any,
        imageObject: [] as any,
      })
    )
  }

  private async showBriefing(): Promise<void> {
    const b = this.state.briefing
    if (!b) return await this.showText('  Lade Kundendaten...')

    const c = b.contact
    const isIns = this.state.isInsurance
    const age = c.custom_fields?.birth_date ? formatAge(c.custom_fields.birth_date) : null
    const L: string[] = []

    L.push(`── KUNDE ──`)
    L.push(`${c.name.toUpperCase()}${age ? `, ${age}J` : ''}`)
    if (c.company) L.push(c.company)
    if (c.phone) L.push(`☎ ${c.phone}`)
    L.push('────────────────────────────')
    L.push(`${b.deals.total} ${isIns ? 'Verträge' : 'Deals'}  ${formatCurrency(b.deals.total_value)} ${isIns ? 'Jahresbeitr.' : 'Volumen'}`)
    if (b.deals.by_stage.length > 0) L.push(b.deals.by_stage.slice(0, 3).map(s => `● ${s.stage}: ${s.count}×`).join('  '))
    L.push(`${b.open_tasks} ${isIns ? 'WV' : 'Tasks'}  ${b.open_tickets} ${isIns ? 'Schäden' : 'Tickets'}`)
    if (isIns && b.insurance?.annual_commission) L.push(`Courtage: ${formatCurrency(b.insurance.annual_commission)}/J`)
    if (b.last_interaction) L.push(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    if (c.category) L.push(`Status: ${c.category}`)
    if (c.since) L.push(`Kunde seit ${new Date(c.since).getFullYear()}`)
    L.push('────────────────────────────')
    L.push('Tap ▶ Verträge   DblTap ◀ Zurück')

    await this.showText(L.join('\n'))
  }

  // ── Formatters ──

  private fmtNearby(): string[] {
    return this.state.nearbyCustomers.map(c => {
      const d = c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km.toFixed(1)}km`
      return `${d} ${c.name}${c.open_tasks > 0 ? ` !${c.open_tasks}` : ''}`
    })
  }
  private fmtAppts(): string[] {
    return this.state.appointments.map(a => `${formatTime(a.start_time)} ${a.contact?.name || '–'} | ${a.title}`)
  }
  private fmtDeals(): string[] {
    return this.state.deals.map(d => this.state.isInsurance
      ? `● ${d.category || d.name} ${d.insurer || ''} ${formatCurrency(d.value)}/J`
      : `${d.name} ${formatCurrency(d.value)} [${d.stage}]`)
  }
  private fmtComms(): string[] {
    const ic: Record<string, string> = { email: '✉', phone: '☎', whatsapp: 'WA', note: '✎', letter: '✉' }
    return this.state.comms.map(c => `${ic[c.type] || '•'}${c.direction === 'inbound' ? '←' : '→'} ${formatDate(c.date)} ${c.subject || c.preview || '–'}`)
  }
  private fmtTasks(): string[] {
    return this.state.tasks.map(t => `${formatDate(t.due_date)} ${t.title} ${priorityIcon(t.priority)}`)
  }
}
