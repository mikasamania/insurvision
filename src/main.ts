/**
 * InsurVision — Even G2 Smart Glasses CRM App
 *
 * The app always renders the Settings page on the smartphone.
 * The glasses bridge runs in parallel if the SDK is available.
 * Settings = phone UI, AppGlasses = glasses display (separate screens).
 */
import { renderSettings } from './settings'

async function main() {
  // Always render settings on the phone/browser screen
  renderSettings()

  // If API key exists, also try to connect to glasses in background
  const apiKey =
    localStorage.getItem('insurvision_api_key') ||
    import.meta.env.VITE_API_KEY

  if (apiKey) {
    try {
      const { AppGlasses } = await import('./glass/AppGlasses')
      const app = new AppGlasses()
      await app.init()
    } catch (err) {
      // Glasses not available (normal browser) — that's fine,
      // settings page is already showing
      console.log('Glasses bridge not available:', err)
    }
  }
}

main()
