export type VideoMpiCapturePhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'finalizing'
  | 'error';

export interface VideoMpiCaptureResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  frames: Blob[];
  /** Filename extension without dot */
  extension: 'webm' | 'mp4';
}

export interface VideoMpiCaptureOptions {
  videoEl: HTMLVideoElement;
  /** Fullscreen shell element (capture overlay). */
  shellEl?: HTMLElement | null;
  facingMode?: 'environment' | 'user';
  /** MediaRecorder timeslice ms for progressive chunks (default 1000). */
  timesliceMs?: number;
  maxFrames?: number;
  frameIntervalMs?: number;
  onPhaseChange?: (phase: VideoMpiCapturePhase) => void;
  onError?: (error: Error) => void;
}
