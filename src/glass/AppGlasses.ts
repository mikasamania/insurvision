/**
 * InsurVision G2 Glasses Controller
 *
 * Uses ONE text container created via createStartUpPageContainer.
 * All updates via textContainerUpgrade (flicker-free).
 * No rebuildPageContainer — that hangs on real devices.
 *
 * Layout inspired by the InsurCRM HUD mockup:
 * ╭──────────────────────────────────────╮
 * │ INSUR//CRM v1.0    G2 ● CONNECTED   │  ← Header
 * │ ──── KUNDE ────                      │  ← Section
 * │ MÜLLER, THOMAS                       │  ← Content
 * │ ● 14.03.1985 (41) ● Stuttgart       │
 * │ ...                                  │
 * │ ──── ─── ●●○○○ ─── ────             │  ← Page dots
 * │ Tap ▶ Weiter   DblTap ◀ Zurück      │  ← Nav hint
 * ╰──────────────────────────────────────╯
 */
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

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
} from '../types/api'
import { formatTime, formatDate, formatCurrency, formatAge, priorityIcon } from '../utils/formatter'
import { truncate } from '../utils/truncate'

// ── Constants ──
const CID = 1
const CNAME = 'main'
const W = 576
const H = 288
const LINE = '────────────────────────────────'
const LINE_SHORT = '──────────────────'

type Screen = 'nearby' | 'appointments' | 'briefing' | 'deals' | 'comms' | 'tasks'
const SCREENS: Screen[] = ['nearby', 'appointments', 'briefing', 'deals', 'comms', 'tasks']

interface State {
  screen: Screen
  provider: string
  isInsurance: boolean
  cursor: number              // highlighted item in lists
  nearbyCustomers: NearbyCustomer[]
  appointments: VisionAppointment[]
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  comms: VisionCommunication[]
  selectedContactId: string | null
  scrollOffset: number
}

// ── GPS Helper ──
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
    cursor: 0, scrollOffset: 0,
    nearbyCustomers: [], appointments: [],
    briefing: null, deals: [], tasks: [], comms: [],
    selectedContactId: null,
  }

  async init(): Promise<void> {
    // 1. Get bridge
    this.bridge = await waitForEvenAppBridge()

    // 2. Create SINGLE text container (never changes, only content updates)
    await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            containerID: CID,
            containerName: CNAME,
            xPosition: 0, yPosition: 0, width: W, height: H,
            borderWidth: 0, borderColor: 0, paddingLength: 6,
            content: 'INSURVISION v1.0\n' + LINE + '\n\n  Verbinde...',
            isEventCapture: 1,
          } as any),
        ] as any,
        imageObject: [] as any,
      })
    )

    // 3. Register events
    this.bridge.onEvenHubEvent((event: any) => {
      try { this.handleEvent(event) } catch (e) { console.error('[IV] event error:', e) }
    })

    // 4. Show loading status
    await this.updateText('INSURVISION v1.0\n' + LINE + '\n\n  Lade Daten...')

    // 5. Load data in parallel
    let hasLocation = false
    try {
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
    } catch (e) {
      console.error('[IV] data load error:', e)
    }

    // 6. Pick start screen + render
    this.state.screen = (hasLocation && this.state.nearbyCustomers.length > 0) ? 'nearby' : 'appointments'
    this.state.cursor = 0
    await this.render()
  }

  // ── Text Update (flicker-free) ──

  private async updateText(content: string): Promise<void> {
    try {
      const trimmed = content.slice(0, 950) // SDK limit ~1000 chars
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: CID,
          containerName: CNAME,
          content: trimmed,
          contentOffset: 0,
          contentLength: trimmed.length,
        } as any)
      )
    } catch (e) {
      console.error('[IV] text update error:', e)
    }
  }

  // ── Event Handling ──

  private handleEvent(event: any): void {
    const textEv = event?.textEvent
    const listEv = event?.listEvent
    const ev = textEv || listEv
    if (!ev) return

    const et = ev.eventType

    // Ignore system events (FOREGROUND_ENTER etc.)
    if (typeof et === 'number' && et >= 4) return

    if (et === OsEventTypeList.SCROLL_TOP_EVENT) {
      // Scroll up = move cursor up in list
      this.onScroll(-1)
    } else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      // Scroll down = move cursor down in list
      this.onScroll(1)
    } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      this.onBack()
    } else if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null || et === 0) {
      this.onTap()
    }
  }

  private onScroll(dir: number): void {
    const max = this.getListLength() - 1
    if (max < 0) return
    this.state.cursor = Math.max(0, Math.min(max, this.state.cursor + dir))
    this.render()
  }

  private getListLength(): number {
    switch (this.state.screen) {
      case 'nearby': return this.state.nearbyCustomers.length
      case 'appointments': return this.state.appointments.length
      case 'deals': return this.state.deals.length
      case 'comms': return this.state.comms.length
      case 'tasks': return this.state.tasks.length
      default: return 0
    }
  }

  private async onTap(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'nearby': {
        const c = s.nearbyCustomers[s.cursor]
        if (c?.id) { s.selectedContactId = c.id; await this.loadBriefing(c.id) }
        break
      }
      case 'appointments': {
        const a = s.appointments[s.cursor]
        if (a?.contact?.id) { s.selectedContactId = a.contact.id; await this.loadBriefing(a.contact.id) }
        break
      }
      case 'briefing': {
        // Tap on briefing → load deals
        if (s.selectedContactId) {
          await this.updateText(this.header('VERTRÄGE') + '\n\n  Lade...')
          try { s.deals = (await getContactDeals(s.selectedContactId)).deals } catch {}
          s.screen = 'deals'; s.cursor = 0; await this.render()
        }
        break
      }
      case 'deals': {
        // Tap on deals → load comms
        if (s.selectedContactId) {
          await this.updateText(this.header('KOMMUNIKATION') + '\n\n  Lade...')
          try { s.comms = (await getContactCommunications(s.selectedContactId)).communications } catch {}
          s.screen = 'comms'; s.cursor = 0; await this.render()
        }
        break
      }
      case 'comms': {
        // Tap on comms → load tasks
        if (s.selectedContactId) {
          await this.updateText(this.header('AUFGABEN') + '\n\n  Lade...')
          try { s.tasks = (await getContactTasks(s.selectedContactId)).tasks } catch {}
          s.screen = 'tasks'; s.cursor = 0; await this.render()
        }
        break
      }
      case 'tasks': {
        // Tap on tasks → back to briefing
        s.screen = 'briefing'; s.cursor = 0; await this.render()
        break
      }
    }
  }

  private async onBack(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'nearby': s.screen = 'appointments'; break
      case 'appointments': if (s.nearbyCustomers.length > 0) s.screen = 'nearby'; break
      case 'briefing': s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'; break
      case 'deals': s.screen = 'briefing'; break
      case 'comms': s.screen = 'deals'; break
      case 'tasks': s.screen = 'comms'; break
    }
    s.cursor = 0
    await this.render()
  }

  private async loadBriefing(contactId: string): Promise<void> {
    this.state.deals = []; this.state.tasks = []; this.state.comms = []
    this.state.screen = 'briefing'
    this.state.cursor = 0
    await this.updateText(this.header('KUNDE') + '\n\n  Lade Kundendaten...')
    try {
      try { this.state.briefing = await getPreparedBriefing(contactId) }
      catch { this.state.briefing = await getContactBriefing(contactId) }
    } catch (e) {
      console.error('[IV] briefing error:', e)
    }
    await this.render()
  }

  // ── Render ──

  private async render(): Promise<void> {
    let text: string
    switch (this.state.screen) {
      case 'nearby':      text = this.renderNearby(); break
      case 'appointments': text = this.renderAppointments(); break
      case 'briefing':    text = this.renderBriefing(); break
      case 'deals':       text = this.renderDeals(); break
      case 'comms':       text = this.renderComms(); break
      case 'tasks':       text = this.renderTasks(); break
      default:            text = 'INSURVISION'; break
    }
    await this.updateText(text)
  }

  // ── Header Builder ──

  private header(section: string): string {
    const status = 'G2 ● CONNECTED'
    const pad = 38 - 'INSURVISION'.length - status.length
    return `INSURVISION${' '.repeat(Math.max(1, pad))}${status}\n${LINE.slice(0, 38)}\n──── ${section} ────`
  }

  // ── Page dots (shows position in screen flow) ──

  private pageDots(): string {
    const screenLabels: Record<Screen, string> = {
      nearby: 'NÄHE', appointments: 'TERMINE', briefing: 'KUNDE',
      deals: this.state.isInsurance ? 'VERTRÄGE' : 'DEALS',
      comms: 'KOMM.', tasks: this.state.isInsurance ? 'WV' : 'TASKS',
    }
    // Show only relevant screens
    const flow: Screen[] = this.state.selectedContactId
      ? ['briefing', 'deals', 'comms', 'tasks']
      : (this.state.nearbyCustomers.length > 0 ? ['nearby', 'appointments'] : ['appointments'])

    return flow.map(s => s === this.state.screen ? `[${screenLabels[s]}]` : ` ${screenLabels[s]} `).join(' ')
  }

  // ── Render: Nearby Customers ──

  private renderNearby(): string {
    const L: string[] = [this.header('IN DER NÄHE')]
    const items = this.state.nearbyCustomers
    if (items.length === 0) {
      L.push('', '  Keine Kunden in der Nähe')
    } else {
      const visible = this.visibleSlice(items, 5)
      visible.forEach((c, i) => {
        const idx = this.state.scrollOffset + i
        const ptr = idx === this.state.cursor ? '▶' : ' '
        const dist = c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km.toFixed(1)}km`
        const tasks = c.open_tasks > 0 ? ` ●${c.open_tasks}` : ''
        L.push(`${ptr} ${dist} ${truncate(c.name, 26)}${tasks}`)
      })
    }
    L.push(LINE.slice(0, 38))
    L.push(this.pageDots())
    L.push('Scroll ↕ Wählen   Tap ▶   DblTap ◀')
    return L.join('\n')
  }

  // ── Render: Appointments ──

  private renderAppointments(): string {
    const L: string[] = [this.header('TERMINE')]
    const items = this.state.appointments
    if (items.length === 0) {
      L.push('', '  Keine anstehenden Termine')
    } else {
      const visible = this.visibleSlice(items, 5)
      visible.forEach((a, i) => {
        const idx = this.state.scrollOffset + i
        const ptr = idx === this.state.cursor ? '▶' : ' '
        const time = formatTime(a.start_time)
        const name = a.contact?.name || '–'
        L.push(`${ptr} ${time} ${truncate(name, 18)} ${truncate(a.title, 12)}`)
      })
    }
    L.push(LINE.slice(0, 38))
    L.push(this.pageDots())
    L.push('Scroll ↕ Wählen   Tap ▶   DblTap ◀')
    return L.join('\n')
  }

  // ── Render: Customer Briefing ──

  private renderBriefing(): string {
    const b = this.state.briefing
    if (!b) return this.header('KUNDE') + '\n\n  Lade Kundendaten...'

    const c = b.contact
    const isIns = this.state.isInsurance
    const age = c.custom_fields?.birth_date ? formatAge(c.custom_fields.birth_date) : null

    const L: string[] = [this.header('KUNDE')]
    // Name groß
    L.push(c.name.toUpperCase() + (age ? `, ${age}J` : ''))
    // Details
    const details: string[] = []
    if (c.custom_fields?.birth_date) details.push(`● ${formatDate(c.custom_fields.birth_date)}`)
    if (c.category) details.push(`● ${c.category}`)
    if (details.length) L.push(details.join('  '))
    if (c.phone) L.push(`☎ ${c.phone}`)
    L.push(LINE_SHORT)
    // KPIs
    const dealLabel = isIns ? 'Verträge' : 'Deals'
    const valLabel = isIns ? 'Jahresbeitr.' : 'Volumen'
    L.push(`${b.deals.total} ${dealLabel}   ${formatCurrency(b.deals.total_value)} ${valLabel}`)
    if (isIns && b.insurance?.annual_commission) {
      L.push(`Courtage: ${formatCurrency(b.insurance.annual_commission)}/J`)
    }
    // Sparten/Stages
    if (b.deals.by_stage.length > 0) {
      L.push(b.deals.by_stage.slice(0, 4).map(s => `● ${s.stage}:${s.count}`).join('  '))
    }
    // Status
    const taskLabel = isIns ? 'WV' : 'Tasks'
    const ticketLabel = isIns ? 'Schäden' : 'Tickets'
    L.push(`${b.open_tasks} ${taskLabel}  ${b.open_tickets} ${ticketLabel}`)
    if (b.last_interaction) L.push(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    L.push(LINE.slice(0, 38))
    L.push(this.pageDots())
    L.push('Tap ▶ Verträge   DblTap ◀ Zurück')
    return L.join('\n')
  }

  // ── Render: Deals/Contracts ──

  private renderDeals(): string {
    const isIns = this.state.isInsurance
    const label = isIns ? 'VERTRÄGE' : 'DEALS'
    const L: string[] = [this.header(label)]
    const items = this.state.deals
    if (items.length === 0) {
      L.push('', `  Keine ${label.toLowerCase()}`)
    } else {
      const visible = this.visibleSlice(items, 5)
      visible.forEach((d, i) => {
        const idx = this.state.scrollOffset + i
        const ptr = idx === this.state.cursor ? '●' : '○'
        if (isIns) {
          L.push(`${ptr} ${truncate(d.category || d.name, 14)} ${truncate(d.insurer || '', 12)} ${formatCurrency(d.value)}`)
        } else {
          L.push(`${ptr} ${truncate(d.name, 20)} ${formatCurrency(d.value)} [${d.stage}]`)
        }
      })
    }
    L.push(LINE.slice(0, 38))
    L.push(this.pageDots())
    L.push('Tap ▶ Komm.   DblTap ◀ Kunde')
    return L.join('\n')
  }

  // ── Render: Communications ──

  private renderComms(): string {
    const L: string[] = [this.header('KOMMUNIKATION')]
    const items = this.state.comms
    if (items.length === 0) {
      L.push('', '  Keine Kommunikation')
    } else {
      const icons: Record<string, string> = {
        email: '✉', phone: '☎', whatsapp: 'W', note: '✎', letter: '✉',
      }
      const visible = this.visibleSlice(items, 5)
      visible.forEach((c, i) => {
        const idx = this.state.scrollOffset + i
        const ptr = idx === this.state.cursor ? '▶' : ' '
        const icon = icons[c.type] || '•'
        const dir = c.direction === 'inbound' ? '←' : '→'
        const date = formatDate(c.date)
        L.push(`${ptr}${icon}${dir} ${date} ${truncate(c.subject || c.preview || '–', 22)}`)
      })
    }
    L.push(LINE.slice(0, 38))
    L.push(this.pageDots())
    L.push('Tap ▶ Aufgaben   DblTap ◀ Verträge')
    return L.join('\n')
  }

  // ── Render: Tasks ──

  private renderTasks(): string {
    const isIns = this.state.isInsurance
    const label = isIns ? 'WIEDERVORLAGEN' : 'TASKS'
    const L: string[] = [this.header(label)]
    const items = this.state.tasks
    if (items.length === 0) {
      L.push('', `  Keine offenen ${label.toLowerCase()}`)
    } else {
      const visible = this.visibleSlice(items, 5)
      visible.forEach((t, i) => {
        const idx = this.state.scrollOffset + i
        const ptr = idx === this.state.cursor ? '▶' : ' '
        const prio = priorityIcon(t.priority)
        L.push(`${ptr} ${formatDate(t.due_date)} ${truncate(t.title, 22)} ${prio}`)
      })
    }
    L.push(LINE.slice(0, 38))
    L.push(this.pageDots())
    L.push('Tap ▶ Kunde   DblTap ◀ Komm.')
    return L.join('\n')
  }

  // ── Helpers ──

  /** Get visible window of items based on cursor position */
  private visibleSlice<T>(items: T[], maxVisible: number): T[] {
    const total = items.length
    if (total <= maxVisible) {
      this.state.scrollOffset = 0
      return items
    }
    // Keep cursor in view
    let start = this.state.scrollOffset
    if (this.state.cursor < start) start = this.state.cursor
    if (this.state.cursor >= start + maxVisible) start = this.state.cursor - maxVisible + 1
    start = Math.max(0, Math.min(total - maxVisible, start))
    this.state.scrollOffset = start
    return items.slice(start, start + maxVisible)
  }
}
