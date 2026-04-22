/**
 * InsurVision — Even G2 Smart Glasses CRM App
 *
 * ## Launch Flow
 *
 * Die App läuft in einer WebView in der Even Realities Telefon-App.
 * Je nachdem WIE sie geöffnet wird (launchSource), verhält sie sich anders:
 *
 * - `appMenu`     = User tippt App-Kachel in Even Hub → Companion UI auf Phone
 * - `glassesMenu` = User öffnet aus dem Brillen-Menü → Rendert auf Brille
 *
 * In beiden Fällen versuchen wir auf die Brille zu rendern, wenn ein
 * API-Key vorhanden ist. Die Phone UI zeigt entweder Setup (kein Key)
 * oder Status (Key vorhanden, App läuft auf der Brille).
 *
 * ## Storage
 *
 * Der API-Key wird via `bridge.getLocalStorage` gelesen — das ist der
 * offizielle Even-Hub-Storage, der über WebView-Neustarts persistiert.
 * Fallback: browser localStorage (Entwicklung, QR-Scan im Browser).
 */
import { renderSettings } from './settings'
import { setStorageBridge, getStorage } from './utils/bridge-storage'
import { warmApiCredentialCache } from './api/client'

const STORAGE_KEY_API = 'insurvision_api_key'

async function tryGetBridge() {
  // Versuche Bridge zu initialisieren — im normalen Browser schlägt das fehl
  try {
    const mod = await import('@evenrealities/even_hub_sdk')
    // Timeout damit wir nicht ewig hängen falls die Bridge nie ready wird
    const bridge = await Promise.race([
      mod.waitForEvenAppBridge(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ])
    return bridge as Awaited<ReturnType<typeof mod.waitForEvenAppBridge>> | null
  } catch (e) {
    console.log('[IV] Bridge not available:', e)
    return null
  }
}

async function renderCompanion(bridge: any, keyPreview: string, hasKey: boolean) {
  const app = document.getElementById('app')!
  if (!hasKey) {
    // Fresh install oder Key nicht gesetzt → Settings zeigen
    await renderSettings()
    return
  }

  // Key vorhanden → Companion-UI mit Launch-Button zeigen
  app.innerHTML = `
    <div style="max-width:480px;margin:0 auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="font-size:24px;margin:0 0 4px;">InsurVision</h1>
        <p style="color:#666;margin:0;font-size:14px;">Smart Glasses CRM</p>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,0.5);"></div>
          <span style="font-size:14px;font-weight:600;color:#166534;">Verbunden</span>
        </div>
        <p style="font-size:13px;color:#15803d;margin:0;">API-Key: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-family:monospace;">…${keyPreview}</code></p>
      </div>

      <button id="launchBtn" style="width:100%;padding:14px 24px;background:#2563eb;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:12px;">
        ▶  App auf Brille starten
      </button>

      <div id="launchStatus" style="text-align:center;font-size:13px;color:#666;min-height:20px;margin-bottom:16px;"></div>

      <button id="openSettingsBtn" style="width:100%;padding:10px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">
        Einstellungen öffnen
      </button>

      <div style="margin-top:20px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px;color:#6b7280;line-height:1.5;">
        <strong style="color:#374151;">💡 Tipp:</strong> Öffne die App direkt über das Menü deiner Brille (TouchBar-Halten), um die UI automatisch zu aktivieren.
      </div>
    </div>
  `

  const statusEl = document.getElementById('launchStatus')!
  const launchBtn = document.getElementById('launchBtn') as HTMLButtonElement
  const settingsBtn = document.getElementById('openSettingsBtn') as HTMLButtonElement

  launchBtn.addEventListener('click', async () => {
    if (!bridge) {
      statusEl.innerHTML = '<span style="color:#dc2626;">⚠ Keine Brille verbunden</span>'
      return
    }
    launchBtn.disabled = true
    statusEl.innerHTML = '<span style="color:#666;">Initialisiere Brille…</span>'
    try {
      const { AppGlasses } = await import('./glass/AppGlasses')
      const ag = new AppGlasses()
      await ag.init()
      statusEl.innerHTML = '<span style="color:#16a34a;">✓ Brille aktiv — CRM-Daten werden angezeigt</span>'
      launchBtn.textContent = '⟳  Neu laden'
      launchBtn.disabled = false
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      statusEl.innerHTML = `<span style="color:#dc2626;">✗ ${msg}</span>`
      launchBtn.disabled = false
    }
  })

  settingsBtn.addEventListener('click', async () => {
    await renderSettings()
  })
}

async function main() {
  // 1. Bridge (falls verfügbar) abrufen & für Storage registrieren
  const bridge = await tryGetBridge()
  setStorageBridge(bridge)

  // 2. Launch-Source erkennen (appMenu vs glassesMenu)
  let launchSource: 'appMenu' | 'glassesMenu' | null = null
  if (bridge) {
    bridge.onLaunchSource((source) => {
      launchSource = source
      console.log('[IV] Launch source:', source)
    })
    // Kurz warten damit der Source-Event ankommt
    await new Promise((r) => setTimeout(r, 300))
  }

  // 3. API-Credentials cachen (für sync Zugriff in fetchApi)
  await warmApiCredentialCache()

  // 4. API-Key lesen (Bridge-Storage bevorzugt)
  const apiKey = await getStorage(STORAGE_KEY_API, import.meta.env.VITE_API_KEY)
  const hasKey = !!apiKey && apiKey.length > 0
  const keyPreview = hasKey ? apiKey.slice(-8) : ''

  // 4. Je nach Launch-Source unterschiedlicher Flow
  if (launchSource === 'glassesMenu' && bridge && hasKey) {
    // Aus Brillen-Menü geöffnet → direkt auf Brille rendern
    console.log('[IV] Launching on glasses (glassesMenu)')
    try {
      const { AppGlasses } = await import('./glass/AppGlasses')
      const ag = new AppGlasses()
      await ag.init()
      // Minimale Phone-UI — die App läuft auf der Brille
      document.getElementById('app')!.innerHTML = `
        <div style="max-width:480px;margin:40px auto;padding:20px;text-align:center;font-family:-apple-system,sans-serif;color:#111;">
          <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px;">
            <div style="width:12px;height:12px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px rgba(34,197,94,0.6);"></div>
            <span style="font-size:16px;font-weight:600;color:#166534;">InsurVision läuft auf deiner Brille</span>
          </div>
          <p style="color:#666;font-size:14px;">Schau durch deine G2 — die CRM-Oberfläche wird dort angezeigt.</p>
        </div>
      `
    } catch (e) {
      console.error('[IV] Glasses launch failed:', e)
      await renderCompanion(bridge, keyPreview, hasKey)
    }
    return
  }

  // Aus App-Menü geöffnet (oder Source unbekannt) → Companion-UI
  await renderCompanion(bridge, keyPreview, hasKey)
}

main().catch((e) => {
  console.error('[IV] Fatal error:', e)
  document.getElementById('app')!.innerHTML = `
    <div style="padding:20px;color:#dc2626;font-family:sans-serif;">
      <h2>Fehler beim Start</h2>
      <pre style="background:#fee;padding:12px;border-radius:8px;font-size:12px;">${e instanceof Error ? e.message : String(e)}</pre>
    </div>
  `
})
