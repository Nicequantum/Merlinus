import { clientLog } from '@/lib/clientLog';
import { extensionForMime, isMediaRecorderAvailable, pickMediaRecorderMimeType } from './mime';
import type {
  VideoMpiCaptureOptions,
  VideoMpiCapturePhase,
  VideoMpiCaptureResult,
} from './types';

const FINALIZE_TIMEOUT_MS = 20_000;

/** Optional Wake Lock API (not in all TS DOM lib targets). */
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: string, fn: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

/** WebKit / iOS fullscreen + orientation lock extensions. */
type ElementWithWebkitFullscreen = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

type DocumentWithWebkitFullscreen = Document & {
  webkitExitFullscreen?: () => void;
};

type ScreenWithOrientation = Screen & {
  orientation?: {
    lock?: (orientation: string) => Promise<void>;
    unlock?: () => void;
  };
};

/**
 * Video MPI capture session — owns camera stream, MediaRecorder, wake lock,
 * fullscreen shell, frame grabs, and deterministic cleanup.
 *
 * Guardrails:
 * - Always stop MediaStream tracks on destroy/stop (camera LED off).
 * - Finalize MediaRecorder with requestData + onstop before releasing tracks.
 * - Reject empty blobs so the UI never "saves" a vanished recording.
 */
export class VideoCaptureSession {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private frames: Blob[] = [];
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private wakeLock: { release: () => Promise<void>; addEventListener?: (type: string, fn: () => void) => void } | null =
    null;
  private videoEl: HTMLVideoElement | null = null;
  private shellEl: HTMLElement | null = null;
  private startMs = 0;
  private mimeType = '';
  private phase: VideoMpiCapturePhase = 'idle';
  private options: VideoMpiCaptureOptions | null = null;
  private recording = false;
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private destroyed = false;

  getPhase(): VideoMpiCapturePhase {
    return this.phase;
  }

  isRecording(): boolean {
    return this.recording;
  }

  private setPhase(phase: VideoMpiCapturePhase): void {
    this.phase = phase;
    this.options?.onPhaseChange?.(phase);
  }

  private emitError(error: Error): void {
    clientLog.error('video_mpi.capture_error', { message: error.message });
    this.options?.onError?.(error);
  }

  async start(options: VideoMpiCaptureOptions): Promise<void> {
    if (this.destroyed) throw new Error('Capture session destroyed');
    if (this.recording) throw new Error('Already recording');
    if (!isMediaRecorderAvailable()) {
      throw new Error('This browser cannot record video in-app. Use Upload video instead.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not available in this browser.');
    }

    this.options = options;
    this.videoEl = options.videoEl;
    this.shellEl = options.shellEl ?? null;
    this.chunks = [];
    this.frames = [];
    this.setPhase('starting');

    try {
      const facing = options.facingMode ?? 'environment';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.destroyed) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Capture cancelled');
      }
      this.stream = stream;

      const video = this.videoEl;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        await video.play().catch(() => undefined);
      }

      this.mimeType = pickMediaRecorderMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = this.mimeType
          ? new MediaRecorder(stream, { mimeType: this.mimeType })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      this.mimeType = recorder.mimeType || this.mimeType || 'video/webm';

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        this.emitError(new Error('Recording failed — try again or upload a file.'));
      };

      this.recorder = recorder;
      const timeslice = options.timesliceMs ?? 1000;
      recorder.start(timeslice);
      this.startMs = Date.now();
      this.recording = true;
      this.setPhase('recording');

      this.installGuards();
      void this.acquireWakeLock();
      void this.enterFullscreen();

      const maxFrames = options.maxFrames ?? 8;
      const frameIntervalMs = options.frameIntervalMs ?? 4000;
      void this.captureFrame();
      this.frameTimer = setInterval(() => {
        if (!this.recording || this.frames.length >= maxFrames) {
          this.clearFrameTimer();
          return;
        }
        void this.captureFrame();
      }, frameIntervalMs);

      clientLog.info('video_mpi.recording_started', {
        mimeType: this.mimeType,
        timeslice,
      });
    } catch (error) {
      this.setPhase('error');
      await this.releaseCameraOnly();
      const err = error instanceof Error ? error : new Error('Could not start camera');
      this.emitError(err);
      throw err;
    }
  }

  /**
   * Stop recording, finalize MediaRecorder blob, release camera / wake lock / fullscreen.
   * Throws if the resulting blob is empty (prevents "disappearing" videos).
   */
  async stop(): Promise<VideoMpiCaptureResult> {
    if (!this.recording && !this.recorder) {
      throw new Error('Not recording');
    }
    this.setPhase('stopping');
    this.recording = false;
    this.clearFrameTimer();
    this.removeGuards();

    // Grab a last frame while the stream is still live.
    void this.captureFrame();

    const recorder = this.recorder;
    let blob: Blob;
    let mimeType = this.mimeType || 'video/webm';

    if (recorder && recorder.state !== 'inactive') {
      blob = await this.finalizeRecorder(recorder);
      mimeType = recorder.mimeType || mimeType;
    } else {
      blob = new Blob(this.chunks, { type: mimeType });
    }

    this.setPhase('finalizing');
    // Release camera only after MediaRecorder has fully finalized.
    await this.releaseCameraOnly();
    await this.releaseWakeLock();
    await this.exitFullscreen();

    this.recorder = null;
    const durationSec = Math.max(1, (Date.now() - this.startMs) / 1000);
    const frames = this.frames.slice(0, this.options?.maxFrames ?? 8);

    if (!blob.size || blob.size < 256) {
      this.setPhase('error');
      const err = new Error(
        'Recording produced no video data. Try again, use a different browser, or upload a file.'
      );
      this.emitError(err);
      throw err;
    }

    this.setPhase('idle');
    clientLog.info('video_mpi.recording_finalized', {
      bytes: blob.size,
      durationSec,
      frameCount: frames.length,
      mimeType,
    });

    return {
      blob,
      mimeType,
      durationSec,
      frames,
      extension: extensionForMime(mimeType),
    };
  }

  /** Full teardown — call on unmount / navigate away. */
  destroy(): void {
    this.destroyed = true;
    this.recording = false;
    this.clearFrameTimer();
    this.removeGuards();

    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.ondataavailable = null;
        this.recorder.onstop = null;
        this.recorder.onerror = null;
        try {
          this.recorder.stop();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    this.recorder = null;
    this.chunks = [];
    this.frames = [];

    void this.releaseCameraOnly();
    void this.releaseWakeLock();
    void this.exitFullscreen();
    this.setPhase('idle');
    clientLog.info('video_mpi.session_destroyed');
  }

  private finalizeRecorder(recorder: MediaRecorder): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mime = recorder.mimeType || this.mimeType || 'video/webm';
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(new Blob(this.chunks, { type: mime }));
      };

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(message));
      };

      const timer = window.setTimeout(() => {
        // Prefer partial chunks over total loss if onstop never fires.
        if (this.chunks.length > 0) {
          clientLog.warn('video_mpi.finalize_timeout_using_chunks', {
            chunkCount: this.chunks.length,
          });
          finish();
        } else {
          fail('Recording finalize timed out with no data');
        }
      }, FINALIZE_TIMEOUT_MS);

      const prevData = recorder.ondataavailable;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (typeof prevData === 'function') {
          try {
            prevData.call(recorder, event);
          } catch {
            // ignore
          }
        }
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      recorder.onstop = () => finish();
      recorder.onerror = () => fail('MediaRecorder error while stopping');

      try {
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // some browsers throw if no data yet
          }
        }
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          finish();
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Could not stop recorder');
      }
    });
  }

  private async captureFrame(): Promise<void> {
    const video = this.videoEl;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return;
    try {
      const canvas = document.createElement('canvas');
      const maxW = 960;
      const scale = Math.min(1, maxW / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
      );
      if (blob && blob.size > 0) this.frames.push(blob);
    } catch (error) {
      clientLog.warn('video_mpi.frame_capture_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private clearFrameTimer(): void {
    if (this.frameTimer !== null) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
  }

  private async releaseCameraOnly(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    const video = this.videoEl;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
      video.srcObject = null;
      try {
        video.load();
      } catch {
        // ignore
      }
    }
  }

  private installGuards(): void {
    this.removeGuards();
    this.beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (!this.recording) return;
      event.preventDefault();
      event.returnValue = '';
    };
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.recording) {
        void this.acquireWakeLock();
      }
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private removeGuards(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock?.request) return;
      this.wakeLock = await nav.wakeLock.request('screen');
      this.wakeLock?.addEventListener?.('release', () => {
        this.wakeLock = null;
      });
    } catch {
      // Wake Lock is optional (denied / unsupported).
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (!lock) return;
    try {
      await lock.release();
    } catch {
      // ignore
    }
  }

  private async enterFullscreen(): Promise<void> {
    const shell = this.shellEl;
    if (!shell) return;
    try {
      if (document.fullscreenElement) return;
      if (shell.requestFullscreen) {
        await shell.requestFullscreen.call(shell);
      } else {
        // iOS / WebKit legacy
        const webkitShell = shell as ElementWithWebkitFullscreen;
        if (typeof webkitShell.webkitRequestFullscreen === 'function') {
          await webkitShell.webkitRequestFullscreen();
        }
      }
    } catch {
      // Pseudo-fullscreen CSS still covers mobile when API is blocked.
    }
    try {
      const orientation = (screen as ScreenWithOrientation).orientation;
      if (orientation?.lock) {
        await orientation.lock('landscape').catch(() => undefined);
      }
    } catch {
      // orientation lock optional
    }
  }

  private async exitFullscreen(): Promise<void> {
    try {
      const orientation = (screen as ScreenWithOrientation).orientation;
      if (orientation?.unlock) orientation.unlock();
    } catch {
      // ignore
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const webkitDoc = document as DocumentWithWebkitFullscreen;
        if (typeof webkitDoc.webkitExitFullscreen === 'function') {
          webkitDoc.webkitExitFullscreen();
        }
      }
    } catch {
      // ignore
    }
  }
}
