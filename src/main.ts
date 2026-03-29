/**
 * InsurVision — Even G2 Smart Glasses CRM App
 *
 * Entry point. Initializes the glasses bridge and starts the app.
 * Uses even-toolkit's per-screen architecture for clean display/action separation.
 */
import { AppGlasses } from './glass/AppGlasses'

const app = new AppGlasses()
app.init().catch((err) => {
  console.error('InsurVision fatal error:', err)
})
