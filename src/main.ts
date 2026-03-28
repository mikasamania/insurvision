import { getNextAppointments, getProviderInfo } from './api/client'
import { Router } from './navigation/router'
import { showSplash, showConnected } from './pages/splash'
import type { EvenAppBridge, TouchEvent, RingEvent } from './types/bridge'

/**
 * Create a bridge instance.
 * In production: @evenrealities/even_hub_sdk's waitForEvenAppBridge.
 * In dev: DOM-based simulator.
 */
async function getBridge(): Promise<EvenAppBridge> {
  try {
    const sdk = await import('@evenrealities/even_hub_sdk')
    return await (sdk as any).waitForEvenAppBridge()
  } catch {
    return createSimulatorBridge()
  }
}

function createSimulatorBridge(): EvenAppBridge {
  const app = document.getElementById('app')!
  app.style.cssText = `
    width: 576px; height: 288px; background: #000; color: #00ff00;
    font-family: monospace; padding: 12px; box-sizing: border-box;
    overflow: hidden; position: relative; border: 2px solid #333;
    border-radius: 8px; margin: 40px auto;
  `

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'text-align: center; font-family: sans-serif; color: #888; margin-top: 20px;'
  wrapper.innerHTML = '<h3 style="color:#aaa">InsurVision G2 Simulator</h3><p style="font-size:12px">Arrow keys or buttons to navigate</p>'
  app.parentElement!.insertBefore(wrapper, app)

  const nav = document.createElement('div')
  nav.style.cssText = 'display:flex; justify-content:center; gap:20px; margin-top:12px;'
  const btnLeft = document.createElement('button')
  btnLeft.textContent = '◀ Links-Tap'
  btnLeft.style.cssText = 'padding:8px 20px; font-size:14px; cursor:pointer;'
  const btnRight = document.createElement('button')
  btnRight.textContent = 'Rechts-Tap ▶'
  btnRight.style.cssText = 'padding:8px 20px; font-size:14px; cursor:pointer;'
  nav.appendChild(btnLeft)
  nav.appendChild(btnRight)
  app.parentElement!.insertBefore(nav, app.nextSibling)

  let touchCallback: ((event: TouchEvent) => void) | null = null
  let ringCallback: ((event: RingEvent) => void) | null = null

  btnLeft.addEventListener('click', () => touchCallback?.('tap_left'))
  btnRight.addEventListener('click', () => touchCallback?.('tap_right'))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') touchCallback?.('tap_left')
    if (e.key === 'ArrowRight') touchCallback?.('tap_right')
  })

  return {
    async sendPage(page) {
      app.innerHTML = ''
      for (const container of page.containers) {
        if (container.type === 'text') {
          const el = document.createElement('div')
          el.textContent = container.text
          el.style.cssText = `
            font-size: ${container.fontSize || 16}px;
            font-weight: ${container.bold ? 'bold' : 'normal'};
            text-align: ${container.alignment || 'left'};
            margin-bottom: 6px; line-height: 1.3;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          `
          app.appendChild(el)
        }
      }
    },
    onTouchEvent(cb) { touchCallback = cb },
    onRingEvent(cb) { ringCallback = cb },
  }
}

async function main() {
  const bridge = await getBridge()
  await showSplash(bridge)

  try {
    // Load provider info + appointments in parallel
    const [providerRes, appointmentsRes] = await Promise.all([
      getProviderInfo().catch(() => ({ provider: 'unknown', features: { has_insurance_data: false, has_commission_data: false, currency: 'EUR' } })),
      getNextAppointments(10),
    ])

    await showConnected(bridge)
    await new Promise((r) => setTimeout(r, 1500))

    // Start router with provider context
    const router = new Router(bridge, appointmentsRes.appointments, providerRes.provider)
    await router.show()
  } catch (err) {
    console.error('InsurVision init error:', err)
    await bridge.sendPage({
      id: 'error',
      containers: [
        { type: 'text', text: 'FEHLER', fontSize: 24, bold: true },
        {
          type: 'text',
          text: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen',
          fontSize: 14,
        },
        { type: 'text', text: 'Prüfe API-Key in Settings', fontSize: 12 },
      ],
    })
  }
}

main()
