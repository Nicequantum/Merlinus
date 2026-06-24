import type { VoiceInputSettings } from './voiceSettings';

/**
 * Monitors microphone RMS level via Web Audio API.
 * SpeechRecognition does not expose noise metrics — a parallel getUserMedia stream
 * with AGC/noise suppression constraints improves consistency on shop-floor tablets.
 */
export class NoiseMonitor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private data: Uint8Array | null = null;
  private level = 0;

  constructor(private readonly onLevel: (level: number) => void) {}

  get currentLevel(): number {
    return this.level;
  }

  async start(settings: Pick<VoiceInputSettings, 'autoGainControl' | 'noiseSuppression' | 'echoCancellation'>): Promise<void> {
    await this.stop();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: settings.autoGainControl,
        noiseSuppression: settings.noiseSuppression,
        echoCancellation: settings.echoCancellation,
      },
      video: false,
    });

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    this.stream = stream;
    this.audioContext = audioContext;
    this.analyser = analyser;
    const sampleBuffer = new Uint8Array(analyser.fftSize);
    this.data = sampleBuffer;

    const tick = () => {
      if (!this.analyser || !this.data) return;
      // Cast required: DOM lib expects Uint8Array<ArrayBuffer> while TS 5.x widens to ArrayBufferLike.
      this.analyser.getByteTimeDomainData(this.data as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const sample = (this.data[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / this.data.length);
      // Map typical bay RMS (~0.01 quiet – ~0.25 loud) into 0–100 for UI.
      const normalized = Math.min(100, Math.round(rms * 420));
      this.level = normalized;
      this.onLevel(normalized);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  async stop(): Promise<void> {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // ignore close races during rapid restart
      }
    }
    this.audioContext = null;
    this.analyser = null;
    this.data = null;
    this.level = 0;
    this.onLevel(0);
  }
}