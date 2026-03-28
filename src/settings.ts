import { testConnection } from './api/client'

/**
 * Settings page rendered on the smartphone in Even Hub.
 * Allows the broker to configure API key, server URL, and preferences.
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

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h2 style="font-size:16px;margin:0 0 12px;">API-Verbindung</h2>

        <label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">API-Key</label>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input id="apiKeyInput" type="password" value="${apiKey}"
            placeholder="API-Key aus InsurCRM eingeben"
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

      <details style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
        <summary style="font-size:16px;font-weight:600;cursor:pointer;">Setup-Anleitung</summary>
        <ol style="font-size:14px;line-height:1.8;padding-left:20px;margin-top:12px;">
          <li>Even Realities App öffnen</li>
          <li>Even Hub → InsurVision installieren</li>
          <li>In InsurCRM: Einstellungen → InsurVision → API-Key generieren</li>
          <li>API-Key hier eingeben oder QR-Code scannen</li>
          <li>Fertig — Ihre Termine erscheinen auf der Brille</li>
        </ol>
      </details>
    </div>
  `

  // Event handlers
  const keyInput = document.getElementById('apiKeyInput') as HTMLInputElement
  const urlInput = document.getElementById('apiUrlInput') as HTMLInputElement
  const statusMsg = document.getElementById('statusMsg')!

  document.getElementById('toggleKey')!.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password'
  })

  document.getElementById('saveBtn')!.addEventListener('click', () => {
    localStorage.setItem('insurvision_api_key', keyInput.value.trim())
    if (urlInput.value.trim()) {
      localStorage.setItem('insurvision_api_url', urlInput.value.trim())
    } else {
      localStorage.removeItem('insurvision_api_url')
    }
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
    statusMsg.innerHTML = '<span style="color:#16a34a;">✓ Gespeichert</span>'
    setTimeout(() => (statusMsg.innerHTML = ''), 2000)
  })

  document.getElementById('testBtn')!.addEventListener('click', async () => {
    statusMsg.innerHTML = '<span style="color:#666;">Teste Verbindung...</span>'
    // Temporarily save key for test
    const origKey = localStorage.getItem('insurvision_api_key')
    localStorage.setItem('insurvision_api_key', keyInput.value.trim())

    const ok = await testConnection()

    if (!ok && origKey !== null) {
      localStorage.setItem('insurvision_api_key', origKey)
    }

    statusMsg.innerHTML = ok
      ? '<span style="color:#16a34a;">✓ Verbindung erfolgreich!</span>'
      : '<span style="color:#dc2626;">✗ Verbindung fehlgeschlagen — API-Key prüfen</span>'
  })
}
