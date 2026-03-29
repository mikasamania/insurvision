/**
 * Coaching Manager — polls AI coaching hints during a consultation.
 *
 * Every 30 seconds, if the transcript has grown significantly,
 * sends the latest chunk to the coaching endpoint.
 * Hints are displayed briefly on the glasses.
 */
import { getCoachingHints } from '../../api/client'

const POLL_INTERVAL_MS = 30_000
const MIN_TRANSCRIPT_GROWTH = 50 // chars before we request new coaching

export type CoachingCallback = (hints: string[]) => void

export class CoachingManager {
  private contactId: string
  private lastSentLength = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners: CoachingCallback[] = []
  private currentHints: string[] = []
  private getTranscript: () => string

  constructor(contactId: string, getTranscript: () => string) {
    this.contactId = contactId
    this.getTranscript = getTranscript
  }

  /** Start polling for coaching hints */
  start(): void {
    this.lastSentLength = 0
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    // First coaching after 20 seconds
    setTimeout(() => this.poll(), 20_000)
  }

  /** Stop polling */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Get current coaching hints */
  getHints(): string[] {
    return this.currentHints
  }

  /** Register for coaching updates */
  onHints(cb: CoachingCallback): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }

  private async poll(): Promise<void> {
    const transcript = this.getTranscript()
    if (!transcript || transcript.length - this.lastSentLength < MIN_TRANSCRIPT_GROWTH) return

    try {
      const chunk = transcript.slice(this.lastSentLength)
      this.lastSentLength = transcript.length
      const res = await getCoachingHints(this.contactId, chunk)
      if (res.hints && res.hints.length > 0) {
        this.currentHints = res.hints
        for (const cb of this.listeners) {
          try { cb(res.hints) } catch {}
        }
      }
    } catch (e) {
      console.error('[IV-Coach] Polling error:', e)
    }
  }
}
