/**
 * STT Manager — wraps even-toolkit's STTEngine for G2 glasses consultation recording.
 *
 * Uses Deepgram streaming (WebSocket) for real-time transcription.
 * Audio source: G2 microphone via GlassBridgeSource (16kHz PCM).
 */
import { getSTTConfig } from '../../api/client'

// Dynamic import of even-toolkit STT (may not be available in all builds)
let STTEngine: any = null
let sttImported = false

async function ensureSTT(): Promise<any> {
  if (!sttImported) {
    try {
      const mod: any = await import('even-toolkit/stt')
      STTEngine = mod.STTEngine || mod.createSTTEngine || mod.default
      sttImported = true
    } catch {
      try {
        const mod: any = await import('even-toolkit/stt/engine')
        STTEngine = mod.STTEngine || mod.createSTTEngine || mod.default
        sttImported = true
      } catch (e) {
        console.error('[IV-STT] Failed to import STTEngine:', e)
      }
    }
  }
  return STTEngine
}

export type TranscriptCallback = (transcript: string, isFinal: boolean) => void

export class STTManager {
  private engine: any = null
  private fullTranscript = ''
  private interimText = ''
  private listeners: TranscriptCallback[] = []
  private startTime = 0

  /** Start recording and transcription */
  async start(): Promise<boolean> {
    try {
      const Engine = await ensureSTT()
      if (!Engine) {
        console.error('[IV-STT] STTEngine not available')
        return false
      }

      // Fetch STT config (Deepgram API key) from backend
      const config = await getSTTConfig()

      this.engine = new Engine({
        provider: config.provider || 'deepgram',
        apiKey: config.apiKey,
        language: config.language || 'de',
        model: config.model || 'nova-2',
        continuous: true,
        vad: { silenceMs: 60000 }, // Long silence tolerance for natural conversation
      })

      this.fullTranscript = ''
      this.interimText = ''
      this.startTime = Date.now()

      // Listen for transcripts
      this.engine.onTranscript((result: any) => {
        if (result.isFinal) {
          if (result.text.trim()) {
            this.fullTranscript += (this.fullTranscript ? ' ' : '') + result.text.trim()
          }
          this.interimText = ''
        } else {
          this.interimText = result.text || ''
        }
        this.notifyListeners(result.isFinal)
      })

      this.engine.onError((err: any) => {
        console.error('[IV-STT] Engine error:', err)
      })

      await this.engine.start()
      return true
    } catch (e) {
      console.error('[IV-STT] Start failed:', e)
      return false
    }
  }

  /** Stop recording */
  async stop(): Promise<void> {
    try {
      if (this.engine) {
        await this.engine.stop()
        this.engine = null
      }
    } catch (e) {
      console.error('[IV-STT] Stop error:', e)
    }
  }

  /** Get the complete transcript so far */
  getTranscript(): string {
    return this.fullTranscript
  }

  /** Get current interim (partial) text */
  getInterimText(): string {
    return this.interimText
  }

  /** Get last N lines of transcript for display */
  getRecentLines(n: number): string[] {
    const combined = this.fullTranscript + (this.interimText ? ' ' + this.interimText : '')
    const words = combined.split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      if ((line + ' ' + word).length > 40) {
        lines.push(line.trim())
        line = word
      } else {
        line += (line ? ' ' : '') + word
      }
    }
    if (line.trim()) lines.push(line.trim())
    return lines.slice(-n)
  }

  /** Duration in seconds */
  getDuration(): number {
    return this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0
  }

  /** Formatted duration MM:SS */
  getFormattedDuration(): string {
    const s = this.getDuration()
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  /** Is currently recording? */
  isActive(): boolean {
    return this.engine !== null
  }

  /** Register for transcript updates */
  onUpdate(cb: TranscriptCallback): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }

  private notifyListeners(isFinal: boolean): void {
    const text = this.fullTranscript + (this.interimText ? ' ' + this.interimText : '')
    for (const cb of this.listeners) {
      try { cb(text, isFinal) } catch {}
    }
  }
}
