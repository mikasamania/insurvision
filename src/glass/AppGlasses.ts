/**
 * InsurVision G2 Glasses Controller
 *
 * CRITICAL DISPLAY PATTERN (from paddle-even-g2 reference):
 * Two text containers per page:
 *   ID 1 'evt': INVISIBLE overlay, content=' ', isEventCapture=1
 *   ID 2 'scr': VISIBLE content, isEventCapture=0
 *
 * This prevents firmware from hijacking scroll events for internal scrolling.
 * Events come through container 1 cleanly. Content renders in container 2.
 *
 * Formatting uses even-toolkit's glass-format utils:
 *   fieldJoin(), kvLine(), progressBar(), glassBox(), drillLabel()
 */
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

import { fieldJoin, kvLine, progressBar, drillLabel } from '../utils/glass-format'
import { glassRule } from '../utils/box-drawing'
import { truncate } from '../utils/truncate'
import {
  sectionHeader, gridRow, statsRow, contractRow, navDots,
  alertLines, productProposal, noteRow, tabBar, rightAlign, dotSep,
  rule, DOT_FULL, ARROW_RIGHT, ARROW_LEFT, TRI_UP, WARN,
} from '../utils/hud-layout'

import {
  getNextAppointments,
  getContactBriefing,
  getContactDeals,
  getContactTasks,
  getContactCommunications,
  getProviderInfo,
  getPreparedBriefing,
  getNearbyCustomers,
  saveConsultation,
  listProcesses,
} from '../api/client'
import type {
  VisionAppointment,
  VisionContactBriefing,
  VisionDeal,
  VisionTask,
  VisionCommunication,
  NearbyCustomer,
} from '../types/api'
import type { ProcessListItem } from '../api/client'
import { formatTime, formatDate, formatCurrency, formatAge, priorityIcon } from '../utils/formatter'
import { STTManager } from './consultation/stt-manager'
import { CoachingManager } from './consultation/coaching-manager'

// ── Display Constants ──
const W = 576
const H = 288

type Screen =
  | 'nearby' | 'appointments' | 'briefing' | 'deals' | 'comms' | 'tasks'
  | 'consult-confirm' | 'consulting' | 'consult-stop' | 'save-note' | 'process-select'

interface State {
  screen: Screen
  provider: string
  isInsurance: boolean
  cursor: number
  scrollOffset: number
  nearbyCustomers: NearbyCustomer[]
  appointments: VisionAppointment[]
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  comms: VisionCommunication[]
  selectedContactId: string | null
  selectedContactName: string
  stt: STTManager | null
  coaching: CoachingManager | null
  coachingHints: string[]
  consultSessionId: string
  processes: ProcessListItem[]
  displayTimer: ReturnType<typeof setInterval> | null
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
  private startupDone = false
  private state: State = {
    screen: 'appointments', provider: 'unknown', isInsurance: false,
    cursor: 0, scrollOffset: 0,
    nearbyCustomers: [], appointments: [],
    briefing: null, deals: [], tasks: [], comms: [],
    selectedContactId: null, selectedContactName: '',
    stt: null, coaching: null, coachingHints: [],
    consultSessionId: '', processes: [], displayTimer: null,
  }
  private busy = false

  async init(): Promise<void> {
    // 1. Get raw bridge
    this.bridge = await waitForEvenAppBridge()

    // 2. Create startup page: invisible event overlay + visible content
    await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer(this.buildPage('INSURVISION\n\nVerbinde...'))
    )
    this.startupDone = true

    // 3. Register events on the bridge
    this.bridge.onEvenHubEvent((event: any) => {
      const ev = event?.textEvent ?? event?.listEvent ?? event?.sysEvent
      if (!ev) return
      const et = ev.eventType
      if (typeof et === 'number' && et >= 4) return // system events

      if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null) {
        this.onTap()
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onDoubleTap()
      } else if (et === OsEventTypeList.SCROLL_TOP_EVENT) {
        this.onScroll(-1)
      } else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        this.onScroll(1)
      }
    })

    // 4. Load data
    await this.updateContent('INSURVISION\n\nLade Daten...')

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

    // 5. Render
    this.state.screen = (hasLocation && this.state.nearbyCustomers.length > 0) ? 'nearby' : 'appointments'
    this.state.cursor = 0
    await this.render()
  }

  // ── Page Builder (dual container: invisible evt + visible content) ──

  private buildPage(content: string): any {
    return {
      containerTotalNum: 2,
      textObject: [
        new TextContainerProperty({
          containerID: 1, containerName: 'evt',
          content: ' ', // invisible — captures all events
          xPosition: 0, yPosition: 0, width: W, height: H,
          isEventCapture: 1, paddingLength: 0,
          borderWidth: 0, borderColor: 0,
        } as any),
        new TextContainerProperty({
          containerID: 2, containerName: 'scr',
          content,
          xPosition: 0, yPosition: 0, width: W, height: H,
          isEventCapture: 0, paddingLength: 6,
          borderWidth: 0, borderColor: 0,
        } as any),
      ],
      imageObject: [],
    }
  }

  /** Update visible content (flicker-free, no page rebuild) */
  private async updateContent(content: string): Promise<void> {
    const trimmed = content.slice(0, 1900)
    try {
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 2, containerName: 'scr',
          contentOffset: 0, contentLength: 2000,
          content: trimmed,
        } as any)
      )
    } catch (e) {
      console.error('[IV] update error:', e)
    }
  }

  // ── Events ──

  private onTap(): void {
    if (this.busy) return
    this.doSelect()
  }

  private onDoubleTap(): void {
    if (this.busy) return
    this.doBack()
  }

  private onScroll(dir: number): void {
    if (this.busy) return
    const s = this.state

    // Detail screens: swipe = next/prev screen tab
    if (['briefing', 'deals', 'comms', 'tasks', 'consult-confirm'].includes(s.screen)) {
      if (dir > 0) this.doNextTab()
      else this.doPrevTab()
      return
    }

    // List screens: move cursor
    const max = this.getListLength() - 1
    if (max < 0) return
    const nc = Math.max(0, Math.min(max, s.cursor + dir))
    if (nc !== s.cursor) {
      s.cursor = nc
      this.render()
    }
  }

  private getListLength(): number {
    switch (this.state.screen) {
      case 'nearby': return this.state.nearbyCustomers.length
      case 'appointments': return this.state.appointments.length
      case 'deals': return this.state.deals.length
      case 'comms': return this.state.comms.length
      case 'tasks': return this.state.tasks.length
      case 'process-select': return this.state.processes.length + 1
      default: return 0
    }
  }

  // ── Select (Tap) ──

  private async doSelect(): Promise<void> {
    this.busy = true
    try {
      const s = this.state
      switch (s.screen) {
        case 'nearby': {
          const c = s.nearbyCustomers[s.cursor]
          if (c?.id) { s.selectedContactId = c.id; s.selectedContactName = c.name; await this.loadBriefing(c.id) }
          break
        }
        case 'appointments': {
          const a = s.appointments[s.cursor]
          if (a?.contact?.id) { s.selectedContactId = a.contact.id; s.selectedContactName = a.contact.name; await this.loadBriefing(a.contact.id) }
          break
        }
        case 'briefing':
        case 'deals':
        case 'comms':
        case 'tasks':
          await this.doNextTab()
          break
        case 'consult-confirm':
          await this.startConsultation()
          break
        case 'consulting':
          s.screen = 'consult-stop'
          await this.render()
          break
        case 'consult-stop':
          await this.stopConsultation()
          break
        case 'process-select': {
          const processes = s.processes
          if (s.cursor < processes.length) {
            await this.saveNote(processes[s.cursor].id)
          } else {
            await this.saveNote(undefined) // new process
          }
          break
        }
        case 'save-note':
          break // saving in progress
      }
    } finally { this.busy = false }
  }

  // ── Back (DoubleTap) ──

  private async doBack(): Promise<void> {
    const s = this.state
    if (s.screen === 'consulting') {
      s.screen = 'consult-stop'
      await this.render()
      return
    }
    if (['consult-stop', 'consult-confirm', 'save-note', 'process-select'].includes(s.screen)) {
      s.screen = 'briefing'
      s.cursor = 0
      await this.render()
      return
    }
    if (['briefing', 'deals', 'comms', 'tasks'].includes(s.screen)) {
      s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'
      s.cursor = 0; s.selectedContactId = null
      await this.render()
      return
    }
    if (s.screen === 'nearby') { s.screen = 'appointments'; s.cursor = 0; await this.render() }
    else if (s.screen === 'appointments' && s.nearbyCustomers.length > 0) { s.screen = 'nearby'; s.cursor = 0; await this.render() }
  }

  // ── Tab Navigation (Swipe on detail screens) ──

  private async doNextTab(): Promise<void> {
    this.busy = true
    const s = this.state; const cid = s.selectedContactId
    try {
      switch (s.screen) {
        case 'briefing':
          if (cid) try { s.deals = (await getContactDeals(cid)).deals } catch {}
          s.screen = 'deals'; break
        case 'deals':
          if (cid) try { s.comms = (await getContactCommunications(cid)).communications } catch {}
          s.screen = 'comms'; break
        case 'comms':
          if (cid) try { s.tasks = (await getContactTasks(cid)).tasks } catch {}
          s.screen = 'tasks'; break
        case 'tasks':
          s.screen = 'consult-confirm'; break
        case 'consult-confirm':
          s.screen = 'briefing'; break
      }
      s.cursor = 0
      await this.render()
    } finally { this.busy = false }
  }

  private async doPrevTab(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'deals': s.screen = 'briefing'; break
      case 'comms': s.screen = 'deals'; break
      case 'tasks': s.screen = 'comms'; break
      case 'consult-confirm': s.screen = 'tasks'; break
      default: return
    }
    s.cursor = 0
    await this.render()
  }

  // ── Data Loading ──

  private async loadBriefing(contactId: string): Promise<void> {
    this.state.deals = []; this.state.tasks = []; this.state.comms = []
    this.state.screen = 'briefing'; this.state.cursor = 0
    await this.updateContent('Lade Kundendaten...')
    try {
      try { this.state.briefing = await getPreparedBriefing(contactId) }
      catch { this.state.briefing = await getContactBriefing(contactId) }
    } catch {}
    await this.render()
  }

  // ── Consultation ──

  private async startConsultation(): Promise<void> {
    const s = this.state
    s.consultSessionId = crypto.randomUUID()
    s.coachingHints = []
    s.screen = 'consulting'

    try {
      s.stt = new STTManager()
      await s.stt.start()
    } catch (e) {
      console.error('[IV] STT init failed:', e)
    }

    if (s.selectedContactId) {
      s.coaching = new CoachingManager(s.selectedContactId, () => s.stt?.getTranscript() || '')
      s.coaching.onHints((hints: string[]) => {
        s.coachingHints = hints
        this.render()
      })
      s.coaching.start()
    }

    // Live timer display
    const startTime = Date.now()
    s.displayTimer = setInterval(() => {
      if (s.screen === 'consulting') {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
        const ss = String(elapsed % 60).padStart(2, '0')
        this.updateContent(this.renderConsulting(mm, ss))
      }
    }, 1000)

    await this.render()
  }

  private async stopConsultation(): Promise<void> {
    const s = this.state
    if (s.displayTimer) { clearInterval(s.displayTimer); s.displayTimer = null }
    s.coaching?.stop()
    s.stt?.stop()

    // Load processes for selection
    if (s.selectedContactId) {
      try { s.processes = (await listProcesses(s.selectedContactId)).processes } catch {}
    }
    s.screen = 'process-select'
    s.cursor = 0
    await this.render()
  }

  private async saveNote(processId: string | undefined): Promise<void> {
    const s = this.state
    s.screen = 'save-note'
    await this.updateContent('Speichere Notiz...')

    try {
      const transcript = s.stt?.getTranscript() || 'Kein Transkript'
      const duration = s.stt?.getDuration() || 0
      await saveConsultation({
        contact_id: s.selectedContactId!,
        transcript,
        duration_seconds: duration,
        session_id: s.consultSessionId,
        process_id: processId,
        process_title: processId ? undefined : `Beratung ${s.selectedContactName}`,
      })
      await this.updateContent(
        `${glassRule(20)}\n` +
        `Notiz gespeichert\n` +
        `${s.selectedContactName}\n` +
        `${Math.floor(duration / 60)} Min. aufgezeichnet\n` +
        `${glassRule(20)}`
      )
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) {
      await this.updateContent(`Fehler: ${e instanceof Error ? e.message : 'Unbekannt'}`)
      await new Promise(r => setTimeout(r, 2000))
    }

    s.stt = null; s.coaching = null
    s.screen = 'briefing'; s.cursor = 0
    await this.render()
  }

  // ── Render Dispatcher ──

  private async render(): Promise<void> {
    const text = this.buildScreen()
    await this.updateContent(text)
  }

  private buildScreen(): string {
    switch (this.state.screen) {
      case 'nearby': return this.screenList('IN DER NÄHE', this.fmtNearby())
      case 'appointments': return this.screenList('TERMINE', this.fmtAppts())
      case 'briefing': return this.screenBriefing()
      case 'deals': return this.screenList(this.state.isInsurance ? 'VERTRÄGE' : 'DEALS', this.fmtDeals())
      case 'comms': return this.screenList('KOMMUNIKATION', this.fmtComms())
      case 'tasks': return this.screenList(this.state.isInsurance ? 'WIEDERVORLAGEN' : 'TASKS', this.fmtTasks())
      case 'consult-confirm': return this.screenConsultConfirm()
      case 'consulting': return this.renderConsulting('00', '00')
      case 'consult-stop': return this.screenConsultStop()
      case 'process-select': return this.screenProcessSelect()
      case 'save-note': return 'Speichere Notiz...'
      default: return 'INSURVISION'
    }
  }

  // ── Screen: List (nearby, appointments, deals, comms, tasks) ──

  private screenList(title: string, items: [string, string][]): string {
    const total = items.length
    const isDetailScreen = ['deals', 'comms', 'tasks'].includes(this.state.screen)
    const isMainList = ['nearby', 'appointments'].includes(this.state.screen)
    // Detail screens reservieren Platz für Nav-Dots → weniger sichtbare Items
    const VISIBLE = isDetailScreen ? 6 : 7
    const L: string[] = []

    // Section header with count badge
    L.push(sectionHeader(title, `${total}`))

    if (total === 0) {
      L.push('')
      L.push('  Keine Einträge')
    } else {
      // Windowed scrolling
      let start = this.state.scrollOffset
      if (this.state.cursor < start) start = this.state.cursor
      if (this.state.cursor >= start + VISIBLE) start = this.state.cursor - VISIBLE + 1
      start = Math.max(0, Math.min(Math.max(0, total - VISIBLE), start))
      this.state.scrollOffset = start

      const visible = items.slice(start, start + VISIBLE)
      for (let i = 0; i < visible.length; i++) {
        const gi = start + i
        const ptr = gi === this.state.cursor ? ARROW_RIGHT : ' '
        L.push(`${ptr} ${visible[i][0]}`)
        if (visible[i][1]) L.push(`   ${visible[i][1]}`)
      }

      // Scroll indicator (nur für Main-Lists mit vielen Items)
      if (isMainList && total > VISIBLE) {
        const pct = Math.round((this.state.cursor / (total - 1)) * 100)
        L.push(`${progressBar(pct, 15)} ${this.state.cursor + 1}/${total}`)
      }
    }

    // Nav dots für Detail-Screens
    if (isDetailScreen) {
      L.push('')
      L.push(this.renderNavDots())
    }

    return L.join('\n')
  }

  // ── Screen: Customer Briefing (HUD Mockup Style) ──

  private screenBriefing(): string {
    const b = this.state.briefing
    if (!b) return 'Lade Kundendaten...'

    const c = b.contact
    const isIns = this.state.isInsurance
    const age = c.custom_fields?.birth_date ? formatAge(c.custom_fields.birth_date) : null
    const L: string[] = []

    // Section header: "─── KUNDE ───           ID: xxxx"
    const shortId = c.id ? c.id.slice(0, 8).toUpperCase() : ''
    L.push(sectionHeader('KUNDE', shortId ? `ID: ${shortId}` : undefined))

    // Big Name
    L.push(c.name.toUpperCase() + (age ? `, ${age}J` : ''))

    // Meta line: "· Geb.date · Stadt"
    const metaParts: string[] = []
    if (c.custom_fields?.birth_date) metaParts.push(formatDate(c.custom_fields.birth_date))
    if (c.category) metaParts.push(c.category)
    if (metaParts.length > 0) L.push(dotSep(...metaParts))

    L.push(rule())

    // KPI Stats Row (3 inline stats)
    const stats: { label: string; value: string }[] = [
      { label: isIns ? 'Verträge' : 'Deals', value: String(b.deals.total) },
      { label: isIns ? 'Jahresbeitr.' : 'Volumen', value: formatCurrency(b.deals.total_value) },
    ]
    if (isIns && b.insurance?.annual_commission) {
      stats.push({ label: 'Courtage', value: formatCurrency(b.insurance.annual_commission) })
    } else if (b.open_tickets > 0 || b.open_tasks > 0) {
      stats.push({ label: isIns ? 'Schäden' : 'Tickets', value: String(b.open_tickets) })
    }
    const [kpiLabels, kpiValues] = statsRow(stats)
    L.push(kpiLabels)
    L.push(kpiValues)

    // Sparten-Dots (wenn vorhanden)
    if (b.deals.by_stage.length > 0) {
      const sparten = b.deals.by_stage.slice(0, 4).map(s => `${DOT_FULL} ${s.stage}:${s.count}`).join('  ')
      L.push(sparten)
    }

    // Tasks + last interaction (kompakt)
    const statusParts: string[] = []
    if (b.open_tasks > 0) statusParts.push(`${b.open_tasks} ${isIns ? 'WV' : 'Tasks'}`)
    if (b.last_interaction) {
      statusParts.push(`${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    }
    if (statusParts.length > 0) L.push(dotSep(...statusParts))

    // Nav dots at bottom
    L.push('')
    L.push(this.renderNavDots())

    return L.map(l => truncate(l, 44)).join('\n')
  }

  // ── Tab indicator for detail screens (nav dots + label) ──

  private renderNavDots(): string {
    const tabs = this.detailTabs()
    const activeIdx = tabs.findIndex(([s]) => s === this.state.screen)
    if (activeIdx < 0) return ''
    const activeLabel = tabs[activeIdx][1]
    return navDots(tabs.length, activeIdx, activeLabel)
  }

  private detailTabs(): [Screen, string][] {
    const isIns = this.state.isInsurance
    return [
      ['briefing', 'KUNDE'],
      ['deals', isIns ? 'VERTRÄGE' : 'DEALS'],
      ['comms', 'KOMM.'],
      ['tasks', isIns ? 'WV' : 'TASKS'],
      ['consult-confirm', 'BERAT.'],
    ]
  }

  // ── Screen: Consultation (HUD Mockup Style) ──

  private screenConsultConfirm(): string {
    const L: string[] = []
    L.push(sectionHeader('BERATUNG'))
    L.push('')
    L.push(`  Beratung starten?`)
    L.push('')
    L.push(`  ${this.state.selectedContactName}`)
    L.push('')
    L.push(`  ${ARROW_RIGHT} Tap    → Aufnahme starten`)
    L.push(`  ${ARROW_LEFT} DblTap → Zurück`)
    L.push('')
    L.push(this.renderNavDots())
    return L.join('\n')
  }

  private renderConsulting(mm: string, ss: string): string {
    const L: string[] = []
    // REC-Zeile mit Pulsing-Dot & Timer
    L.push(rightAlign(`${DOT_FULL} REC  ${mm}:${ss}`, this.state.selectedContactName, 42))
    L.push(rule())

    if (this.state.coachingHints.length > 0) {
      L.push('COACHING:')
      for (const h of this.state.coachingHints.slice(0, 5)) {
        L.push(`${ARROW_RIGHT} ${truncate(h, 40)}`)
      }
    } else {
      L.push('')
      L.push('  Aufnahme läuft…')
      L.push('  Coaching erscheint live')
      L.push('')
    }

    L.push(rule())
    L.push('DblTap → Beenden')
    return L.join('\n')
  }

  private screenConsultStop(): string {
    return [
      sectionHeader('BERATUNG BEENDEN'),
      '',
      '  Gespräch wirklich beenden?',
      '',
      `  ${ARROW_RIGHT} Tap    → Beenden & Speichern`,
      `  ${ARROW_LEFT} DblTap → Weiter aufnehmen`,
      '',
      rule(),
    ].join('\n')
  }

  private screenProcessSelect(): string {
    const items: [string, string][] = this.state.processes.map(p => [
      truncate(p.title, 36),
      fieldJoin(p.status, p.process_type),
    ])
    items.push([drillLabel('Neuen Vorgang anlegen'), ''])
    return this.screenList('VORGANG WÄHLEN', items)
  }

  // ── List Item Formatters (return [main line, sub line]) ──

  private fmtNearby(): [string, string][] {
    return this.state.nearbyCustomers.map(c => {
      const d = c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km.toFixed(1)}km`
      const main = `${d}  ${c.name}`
      const sub = fieldJoin(
        c.contracts_count > 0 ? `${c.contracts_count} Vertr.` : '',
        c.annual_premium > 0 ? formatCurrency(c.annual_premium) : '',
        c.open_tasks > 0 ? `!${c.open_tasks} offen` : '',
      )
      return [truncate(main, 38), sub]
    })
  }

  private fmtAppts(): [string, string][] {
    return this.state.appointments.map(a => [
      truncate(`${formatTime(a.start_time)}  ${a.contact?.name || '\u2013'}`, 38),
      truncate(a.title || '', 36),
    ])
  }

  private fmtDeals(): [string, string][] {
    return this.state.deals.map(d => {
      if (this.state.isInsurance) {
        // HUD Mockup Style: "● PHV  Haftpflichtkasse  €86"
        const status = this.dealStatusIcon(d.stage)
        const sparte = (d.category || d.name).slice(0, 8).padEnd(8)
        const insurer = (d.insurer || '-').slice(0, 16)
        const price = formatCurrency(d.value)
        // Main line mit allen Infos rechts-ausgerichtet
        const main = rightAlign(`${status} ${sparte} ${insurer}`, price, 40)
        return [main, '']
      }
      return [truncate(`${d.name}  ${formatCurrency(d.value)}`, 38), truncate(`[${d.stage}]`, 36)]
    })
  }

  private dealStatusIcon(stage: string | null | undefined): string {
    const s = (stage || '').toLowerCase()
    if (s.includes('active') || s.includes('aktiv')) return DOT_FULL
    if (s.includes('pending') || s.includes('prüf') || s.includes('check')) return '\u25D0' // ◐
    if (s.includes('cancel') || s.includes('gekündig')) return WARN
    return DOT_FULL
  }

  private fmtComms(): [string, string][] {
    const ic: Record<string, string> = { email: '\u2709', phone: '\u260E', whatsapp: 'WA', note: '\u270E', letter: '\u2709' }
    return this.state.comms.map(c => [
      truncate(`${ic[c.type] || '\u2022'}${c.direction === 'inbound' ? '\u2190' : '\u2192'} ${formatDate(c.date)}`, 38),
      truncate(c.subject || c.preview || '\u2013', 36),
    ])
  }

  private fmtTasks(): [string, string][] {
    return this.state.tasks.map(t => [
      truncate(`${formatDate(t.due_date)} ${priorityIcon(t.priority)}  ${t.title}`, 38),
      '',
    ])
  }
}
