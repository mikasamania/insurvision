/**
 * InsurVision G2 Glasses Controller
 *
 * Uses native G2 SDK (rebuildPageContainer + ListContainer)
 * for firmware-managed scroll highlighting on lists.
 *
 * IMPORTANT: After the first rebuildPageContainer call, NEVER use
 * even-toolkit's showTextPage/updateText — it will hang because
 * the even-toolkit page no longer exists.
 */
import {
  RebuildPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
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

function getGPS(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No GPS'))
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('GPS timeout')) } }, 5000)
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (!done) { done = true; clearTimeout(timer); resolve(pos) } },
      (err) => { if (!done) { done = true; clearTimeout(timer); reject(err) } },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }
    )
  })
}

export class AppGlasses {
  private bridge: EvenHubBridge
  private raw: EvenAppBridge | null = null
  private state: State
  private rawReady = false

  constructor() {
    this.bridge = new EvenHubBridge()
    this.state = {
      screen: 'nearby', provider: 'unknown', isInsurance: false,
      nearbyCustomers: [], appointments: [],
      briefing: null, deals: [], tasks: [], comms: [],
      locationError: null, selectedContactId: null,
    }
  }

  async init(): Promise<void> {
    // Step 1: Init bridge + show splash via even-toolkit (safe initial render)
    await this.bridge.init()
    this.raw = this.bridge.rawBridge
    await this.bridge.setupTextPage()
    await this.bridge.showTextPage('  INSURVISION\n  Smart Glasses CRM\n────────────────────────────\n  Lade Daten...')

    // Step 2: Register events
    this.bridge.onEvent((event: EvenHubEvent) => this.handleEvent(event))

    // Step 3: Load all data in parallel (each with own error handling)
    let hasLocation = false
    const results = await Promise.allSettled([
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

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.log('[IV] Init', ['provider', 'GPS/nearby', 'appointments'][i], 'failed:', r.reason?.message || r.reason)
      }
    })

    // Step 4: Pick start screen
    this.state.screen = (hasLocation && this.state.nearbyCustomers.length > 0) ? 'nearby' : 'appointments'

    // Step 5: Switch to raw bridge and render
    // From this point on, ONLY use showText/renderList (raw bridge)
    // Never call this.bridge.showTextPage/updateText again!
    this.rawReady = true
    await this.render()
  }

  // ── Event Handling ──

  private handleEvent(event: EvenHubEvent): void {
    const raw = event as any
    const listEv = raw?.listEvent
    const textEv = raw?.textEvent

    if (listEv) {
      const et = listEv.eventType
      const idx = listEv.currentSelectItemIndex
      if (typeof et === 'number' && et >= 4) return
      if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null) {
        this.onListSelect(idx ?? 0)
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

  private async onListSelect(itemIndex: number): Promise<void> {
    const s = this.state
    if (s.screen === 'nearby') {
      const c = s.nearbyCustomers[itemIndex]
      if (c?.id) { s.selectedContactId = c.id; await this.loadAndShowBriefing(c.id) }
    } else if (s.screen === 'appointments') {
      const apt = s.appointments[itemIndex]
      if (apt?.contact?.id) { s.selectedContactId = apt.contact.id; await this.loadAndShowBriefing(apt.contact.id) }
    }
  }

  private async onTextTap(): Promise<void> {
    if (this.state.screen === 'briefing' && this.state.selectedContactId) {
      try { this.state.deals = (await getContactDeals(this.state.selectedContactId)).deals } catch {}
      this.state.screen = 'deals'
      await this.render()
    }
  }

  private async onBack(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'nearby': s.screen = 'appointments'; break
      case 'appointments': s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'; break
      case 'briefing': s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'; break
      case 'deals':
        if (s.selectedContactId) { try { s.comms = (await getContactCommunications(s.selectedContactId)).communications } catch {} }
        s.screen = 'comms'; break
      case 'comms':
        if (s.selectedContactId) { try { s.tasks = (await getContactTasks(s.selectedContactId)).tasks } catch {} }
        s.screen = 'tasks'; break
      case 'tasks': s.screen = 'briefing'; break
    }
    await this.render()
  }

  private async loadAndShowBriefing(contactId: string): Promise<void> {
    this.state.deals = []; this.state.tasks = []; this.state.comms = []
    this.state.screen = 'briefing'
    await this.showText('  Lade Kundendaten...')
    try {
      try { this.state.briefing = await getPreparedBriefing(contactId) }
      catch { this.state.briefing = await getContactBriefing(contactId) }
    } catch (e) { console.error('[IV] briefing failed:', e) }
    await this.render()
  }

  // ── Render ──

  private async render(): Promise<void> {
    switch (this.state.screen) {
      case 'nearby': await this.renderList('IN DER NÄHE', this.fmtNearby(), 'Tap=Kunde  DblTap=Termine'); break
      case 'appointments': await this.renderList('TERMINE', this.fmtAppointments(), 'Tap=Kunde  DblTap=Nähe'); break
      case 'briefing': await this.renderBriefing(); break
      case 'deals': await this.renderList(this.state.isInsurance ? 'VERTRÄGE' : 'DEALS', this.fmtDeals(), 'DblTap=Kommunikation'); break
      case 'comms': await this.renderList('KOMMUNIKATION', this.fmtComms(), 'DblTap=Aufgaben'); break
      case 'tasks': await this.renderList(this.state.isInsurance ? 'WIEDERVORLAGEN' : 'TASKS', this.fmtTasks(), 'DblTap=Briefing'); break
    }
  }

  // ── Native List Page ──

  private async renderList(title: string, items: string[], footer: string): Promise<void> {
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

    try {
      await this.raw!.rebuildPageContainer(
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
    } catch (e) {
      console.error('[IV] renderList failed:', e)
      // Fallback: render as text
      await this.showText(`── ${title} ──\n${items.join('\n')}\n────────────────────\n${footer}`)
    }
  }

  // ── Text Detail Page ──

  private async renderBriefing(): Promise<void> {
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

    const dl = isIns ? 'Verträge' : 'Deals'
    L.push(`${b.deals.total} ${dl}  ${formatCurrency(b.deals.total_value)} ${isIns ? 'Jahresbeitr.' : 'Volumen'}`)

    if (b.deals.by_stage.length > 0) {
      L.push(b.deals.by_stage.slice(0, 3).map(s => `● ${s.stage}: ${s.count}×`).join('  '))
    }

    L.push(`${b.open_tasks} ${isIns ? 'WV' : 'Tasks'}  ${b.open_tickets} ${isIns ? 'Schäden' : 'Tickets'}`)

    if (isIns && b.insurance?.annual_commission) L.push(`Courtage: ${formatCurrency(b.insurance.annual_commission)}/J`)
    if (b.last_interaction) L.push(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    if (c.category) L.push(`Status: ${c.category}`)
    if (c.since) L.push(`Kunde seit ${new Date(c.since).getFullYear()}`)

    L.push('────────────────────────────')
    L.push('Tap ▶ Verträge   DblTap ◀ Zurück')

    await this.showText(L.join('\n'))
  }

  // ── Format Helpers ──

  private fmtNearby(): string[] {
    return this.state.nearbyCustomers.map(c => {
      const dist = c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km.toFixed(1)}km`
      const tasks = c.open_tasks > 0 ? ` !${c.open_tasks}` : ''
      return `${dist} ${c.name}${tasks}`
    })
  }

  private fmtAppointments(): string[] {
    return this.state.appointments.map(a => `${formatTime(a.start_time)} ${a.contact?.name || '–'} | ${a.title}`)
  }

  private fmtDeals(): string[] {
    return this.state.deals.map(d => this.state.isInsurance
      ? `● ${d.category || d.name} ${d.insurer || ''} ${formatCurrency(d.value)}/J`
      : `${d.name} ${formatCurrency(d.value)} [${d.stage}]`
    )
  }

  private fmtComms(): string[] {
    const icons: Record<string, string> = { email: '✉', phone: '☎', whatsapp: 'WA', note: '✎', letter: '✉' }
    return this.state.comms.map(c => {
      const dir = c.direction === 'inbound' ? '←' : '→'
      return `${icons[c.type] || '•'}${dir} ${formatDate(c.date)} ${c.subject || c.preview || '–'}`
    })
  }

  private fmtTasks(): string[] {
    return this.state.tasks.map(t => `${formatDate(t.due_date)} ${t.title} ${priorityIcon(t.priority)}`)
  }

  // ── Low-level: showText via raw bridge ──

  private async showText(content: string): Promise<void> {
    if (!this.rawReady || !this.raw) {
      // Before raw bridge is ready, use even-toolkit
      await this.bridge.updateText(content)
      return
    }
    try {
      await this.raw.rebuildPageContainer(
        new RebuildPageContainer({
          containerTotalNum: 1,
          textObject: [
            new TextContainerProperty({ containerID: 1, containerName: 'main', xPosition: 0, yPosition: 0, width: 576, height: 288, borderWidth: 0, borderColor: 0, paddingLength: 8, content, isEventCapture: 1 } as any),
          ] as any,
          listObject: [] as any,
          imageObject: [] as any,
        })
      )
    } catch (e) {
      console.error('[IV] showText raw failed:', e)
    }
  }
}
