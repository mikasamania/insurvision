/**
 * InsurVision — Even G2 Smart Glasses CRM App
 *
 * Entry point. Detects context:
 * - If API key is configured → init glasses bridge
 * - If no key → show settings page on smartphone
 */
import { AppGlasses } from './glass/AppGlasses'
import { renderSettings } from './settings'

function hasApiKey(): boolean {
  return !!(
    localStorage.getItem('insurvision_api_key') ||
    import.meta.env.VITE_API_KEY
  )
}

async function main() {
  if (!hasApiKey()) {
    // No API key → show settings UI on smartphone
    renderSettings()
    return
  }

  // API key exists → try to connect glasses
  try {
    const app = new AppGlasses()
    await app.init()
  } catch (err) {
    console.error('Glasses init failed, showing settings:', err)
    // Fallback to settings if bridge fails (e.g. running on phone browser)
    renderSettings()
  }
}

main()
