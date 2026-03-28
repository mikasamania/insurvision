import { testConnection, getConnectionStatus, saveQRConfig, clearConfig } from './api/client'
import type { ConnectionStatus } from './api/client'

/**
 * Settings page rendered on the smartphone in Even Hub.
 * Supports QR-code scanning and shows connection status.
 */
export function renderSettings(): void {
  const app = document.getElementById('app')!

  const apiKey = localStorage.getItem('insurvision_api_key') || ''
  const apiUrl = localStorage.getItem('insurvision_api_url') || ''
  const refreshInterval = localStorage.getItem('insurvision_refresh') || '15'
  const showCommission = localStorage.getItem('insurvision_show_commission') !== 'false'
  const showReminders = localStorage.getItem('insurvision_show_reminders') !== 'false'

  app.innerHTML = `
    <div style="max-width:480px;margin:0 auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#333;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="font-size:24px;margin:0;">InsurVision</h1>
        <p style="color:#666;margin:4px 0;">Smart Glasses CRM</p>
        <span style="background:#fbbf24;color:#92400e;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Beta</span>
      </div>

      <!-- Connection Status -->
      <div id="connStatus" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:16px;display:none;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div id="statusDot" style="width:10px;height:10px;border-radius:50%;background:#22c55e;"></div>
          <span id="statusText" style="font-size:14px;font-weight:600;color:#166534;">Verbunden</span>
        </div>
        <div id="statusDetails" style="font-size:13px;color:#15803d;"></div>
      </div>

      <!-- QR Code Scan -->
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
        <button id="scanQRBtn" style="padding:12px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;">
          📸 QR-Code scannen
        </button>
        <p style="font-size:12px;color:#3b82f6;margin:8px 0 0;">
          Öffne <a href="https://vision.insur360.de/connect" target="_blank" style="color:#1d4ed8;text-decoration:underline;">vision.insur360.de/connect</a> und scanne den QR-Code
        </p>
      </div>

      <!-- Manual Key Entry -->
      <details style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
        <summary style="font-size:14px;font-weight:600;cursor:pointer;">API-Key manuell eingeben</summary>
        <div style="margin-top:12px;">
          <label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">API-Key</label>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="apiKeyInput" type="password" value="${apiKey}"
              placeholder="API-Key einfügen"
              style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;" />
            <button id="toggleKey" style="padding:10px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">👁</button>
          </div>

          <label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">Server-URL (optional)</label>
          <input id="apiUrlInput" type="url" value="${apiUrl}"
            placeholder="Standard: InsurCRM Produktion"
            style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:12px;" />

          <div style="display:flex;gap:8px;">
            <button id="saveBtn" style="flex:1;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Speichern</button>
            <button id="testBtn" style="flex:1;padding:10px;background:#fff;color:#2563eb;border:2px solid #2563eb;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Testen</button>
          </div>
          <div id="statusMsg" style="margin-top:8px;font-size:13px;text-align:center;"></div>
        </div>
      </details>

      <!-- Preferences -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h2 style="font-size:16px;margin:0 0 12px;">Einstellungen</h2>

        <label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">Aktualisierung</label>
        <select id="refreshSelect" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:12px;">
          <option value="5" ${refreshInterval === '5' ? 'selected' : ''}>Alle 5 Minuten</option>
          <option value="15" ${refreshInterval === '15' ? 'selected' : ''}>Alle 15 Minuten</option>
          <option value="30" ${refreshInterval === '30' ? 'selected' : ''}>Alle 30 Minuten</option>
          <option value="0" ${refreshInterval === '0' ? 'selected' : ''}>Manuell</option>
        </select>

        <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:8px;cursor:pointer;">
          <input type="checkbox" id="showCommission" ${showCommission ? 'checked' : ''} style="width:18px;height:18px;" />
          Courtage anzeigen
        </label>

        <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;">
          <input type="checkbox" id="showReminders" ${showReminders ? 'checked' : ''} style="width:18px;height:18px;" />
          Wiedervorlagen-Anzahl anzeigen
        </label>
      </div>

      <!-- Disconnect -->
      <button id="disconnectBtn" style="width:100%;padding:10px;background:#fff;color:#dc2626;border:2px solid #fecaca;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;margin-bottom:16px;display:${apiKey ? 'block' : 'none'};">
        Verbindung trennen
      </button>

      <!-- Setup Guide -->
      <details style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <summary style="font-size:16px;font-weight:600;cursor:pointer;">Setup-Anleitung</summary>
        <ol style="font-size:14px;line-height:1.8;padding-left:20px;margin-top:12px;">
          <li>Öffne <a href="https://vision.insur360.de/connect" target="_blank">vision.insur360.de/connect</a></li>
          <li>Wähle dein CRM und verbinde es</li>
          <li>Scanne den QR-Code hier in den Settings</li>
          <li>Fertig — Deine Termine erscheinen auf der Brille</li>
        </ol>
      </details>
    </div>
  `

  // Load connection status if key exists
  if (apiKey) {
    loadConnectionStatus()
  }

  // Event handlers
  const keyInput = document.getElementById('apiKeyInput') as HTMLInputElement
  const urlInput = document.getElementById('apiUrlInput') as HTMLInputElement
  const statusMsg = document.getElementById('statusMsg')!

  document.getElementById('toggleKey')!.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password'
  })

  document.getElementById('scanQRBtn')!.addEventListener('click', startQRScan)

  document.getElementById('saveBtn')!.addEventListener('click', () => {
    localStorage.setItem('insurvision_api_key', keyInput.value.trim())
    if (urlInput.value.trim()) {
      localStorage.setItem('insurvision_api_url', urlInput.value.trim())
    } else {
      localStorage.removeItem('insurvision_api_url')
    }
    savePreferences()
    statusMsg.innerHTML = '<span style="color:#16a34a;">✓ Gespeichert</span>'
    setTimeout(() => { statusMsg.innerHTML = ''; loadConnectionStatus() }, 1500)
  })

  document.getElementById('testBtn')!.addEventListener('click', async () => {
    statusMsg.innerHTML = '<span style="color:#666;">Teste Verbindung...</span>'
    const origKey = localStorage.getItem('insurvision_api_key')
    localStorage.setItem('insurvision_api_key', keyInput.value.trim())
    const ok = await testConnection()
    if (!ok && origKey !== null) localStorage.setItem('insurvision_api_key', origKey)
    statusMsg.innerHTML = ok
      ? '<span style="color:#16a34a;">✓ Verbindung erfolgreich!</span>'
      : '<span style="color:#dc2626;">✗ Verbindung fehlgeschlagen</span>'
    if (ok) loadConnectionStatus()
  })

  document.getElementById('disconnectBtn')!.addEventListener('click', () => {
    if (confirm('Verbindung wirklich trennen?')) {
      clearConfig()
      renderSettings() // Re-render
    }
  })
}

async function loadConnectionStatus(): Promise<void> {
  const statusEl = document.getElementById('connStatus')
  if (!statusEl) return

  try {
    const status: ConnectionStatus = await getConnectionStatus()
    statusEl.style.display = 'block'

    const dot = document.getElementById('statusDot')!
    const text = document.getElementById('statusText')!
    const details = document.getElementById('statusDetails')!

    if (status.connected && status.token_valid) {
      statusEl.style.background = '#f0fdf4'
      statusEl.style.borderColor = '#bbf7d0'
      dot.style.background = '#22c55e'
      text.style.color = '#166534'
      text.textContent = `Verbunden mit ${status.provider_name}`
      details.innerHTML = `${status.connection_name}${status.last_sync ? ` · Letzte Sync: ${new Date(status.last_sync).toLocaleString('de-DE')}` : ''}`
    } else if (status.connected && !status.token_valid) {
      statusEl.style.background = '#fffbeb'
      statusEl.style.borderColor = '#fde68a'
      dot.style.background = '#f59e0b'
      text.style.color = '#92400e'
      text.textContent = 'Token abgelaufen'
      details.innerHTML = `Bitte <a href="https://vision.insur360.de/connect" target="_blank" style="color:#1d4ed8;">erneut verbinden</a>`
    }

    if (status.refresh_error) {
      details.innerHTML += `<br><span style="color:#dc2626;font-size:12px;">Fehler: ${status.refresh_error}</span>`
    }
  } catch {
    statusEl.style.display = 'block'
    statusEl.style.background = '#fef2f2'
    statusEl.style.borderColor = '#fecaca'
    document.getElementById('statusDot')!.style.background = '#ef4444'
    document.getElementById('statusText')!.textContent = 'Nicht verbunden'
    document.getElementById('statusText')!.style.color = '#991b1b'
    document.getElementById('statusDetails')!.innerHTML = ''
  }
}

function savePreferences(): void {
  localStorage.setItem(
    'insurvision_refresh',
    (document.getElementById('refreshSelect') as HTMLSelectElement).value
  )
  localStorage.setItem(
    'insurvision_show_commission',
    String((document.getElementById('showCommission') as HTMLInputElement).checked)
  )
  localStorage.setItem(
    'insurvision_show_reminders',
    String((document.getElementById('showReminders') as HTMLInputElement).checked)
  )
}

async function startQRScan(): Promise<void> {
  // Use HTML5 camera API for QR scanning on smartphone
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })

    // Create video overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;'

    const video = document.createElement('video')
    video.style.cssText = 'width:100%;max-width:400px;border-radius:12px;'
    video.srcObject = stream
    video.setAttribute('playsinline', '')
    video.play()

    const hint = document.createElement('p')
    hint.style.cssText = 'color:#fff;margin-top:16px;font-size:14px;'
    hint.textContent = 'QR-Code in das Kamerabild halten'

    const cancelBtn = document.createElement('button')
    cancelBtn.style.cssText = 'margin-top:16px;padding:10px 24px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;'
    cancelBtn.textContent = 'Abbrechen'
    cancelBtn.onclick = () => {
      stream.getTracks().forEach((t) => t.stop())
      overlay.remove()
    }

    overlay.appendChild(video)
    overlay.appendChild(hint)
    overlay.appendChild(cancelBtn)
    document.body.appendChild(overlay)

    // Scan loop using BarcodeDetector (Chrome) or manual fallback
    if ('BarcodeDetector' in window) {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      const scanLoop = async () => {
        try {
          const barcodes = await detector.detect(video)
          if (barcodes.length > 0) {
            const data = JSON.parse(barcodes[0].rawValue)
            if (data.key) {
              saveQRConfig(data)
              stream.getTracks().forEach((t) => t.stop())
              overlay.remove()
              renderSettings()
              return
            }
          }
        } catch { /* continue scanning */ }
        if (document.body.contains(overlay)) {
          requestAnimationFrame(scanLoop)
        }
      }
      scanLoop()
    } else {
      hint.textContent = 'QR-Scanner nicht unterstützt. Bitte Key manuell eingeben.'
    }
  } catch (err) {
    alert('Kamerazugriff nicht möglich. Bitte Key manuell eingeben.')
  }
}
