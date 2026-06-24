'use client';

import { Hand, Mic, MicOff, RefreshCw, ToggleLeft } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface VoiceInputButtonProps {
  targetRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onTranscript: (value: string) => void;
  className?: string;
}

function formatConfidence(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function noiseLabel(level: number): string {
  if (level < 20) return 'Quiet';
  if (level < 45) return 'Moderate';
  if (level < 70) return 'Noisy';
  return 'Very noisy';
}

export function VoiceInputButton({ targetRef, onTranscript, className = '' }: VoiceInputButtonProps) {
  const pushActiveRef = useRef(false);
  const {
    isListening,
    isSupported,
    isEnabled,
    permission,
    mode,
    noiseLevel,
    confidence,
    confidenceThreshold,
    interimText,
    committedText,
    listeningState,
    errorMessage,
    settings,
    toggleListening,
    beginPushToTalk,
    endPushToTalk,
    setMode,
    retry,
    refreshPermission,
    stopListening,
  } = useVoiceInput();

  useEffect(() => {
    void refreshPermission();
    return () => stopListening();
  }, [refreshPermission, stopListening]);

  const handleTranscript = useCallback(
    (value: string) => {
      onTranscript(value);
    },
    [onTranscript]
  );

  const ensureTarget = useCallback(() => {
    const el = targetRef.current;
    if (!el) return null;
    return el;
  }, [targetRef]);

  const handleToggleClick = () => {
    const el = ensureTarget();
    if (!el) return;

    if (!isEnabled) {
      toast.message('Voice input is disabled for this dealership. Type your notes below.');
      return;
    }
    if (!isSupported) {
      toast.error('Voice input is not supported in this browser. Use Chrome or Edge on your tablet.');
      return;
    }
    if (permission === 'denied') {
      toast.error('Microphone blocked. Open site settings and allow mic access, then reload.');
      return;
    }

    toggleListening(el, handleTranscript);
  };

  const handlePushStart = () => {
    if (mode !== 'push-to-talk' || pushActiveRef.current) return;
    const el = ensureTarget();
    if (!el || !isEnabled || !isSupported) return;
    pushActiveRef.current = true;
    beginPushToTalk(el, handleTranscript);
  };

  const handlePushEnd = () => {
    if (!pushActiveRef.current) return;
    pushActiveRef.current = false;
    endPushToTalk();
  };

  const handleModeSwitch = () => {
    const next = mode === 'push-to-talk' ? 'toggle' : 'push-to-talk';
    setMode(next);
    toast.message(
      next === 'push-to-talk'
        ? 'Push-to-talk enabled — hold the mic button while speaking.'
        : 'Tap-to-toggle enabled — tap once to start and again to stop.'
    );
  };

  const handleRetry = async () => {
    const ok = await retry();
    if (!ok) toast.error('Could not restart voice input. Check the microphone and try again.');
  };

  if (!isEnabled) return null;

  const showPanel = isListening || listeningState === 'timeout' || listeningState === 'error' || interimText.length > 0;
  const micTitle =
    mode === 'push-to-talk'
      ? isListening
        ? 'Release to stop (push-to-talk)'
        : 'Hold to speak (push-to-talk)'
      : isListening
        ? 'Stop voice input'
        : 'Start voice input — hands-free story entry';

  const micHandlers =
    mode === 'push-to-talk'
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            handlePushStart();
          },
          onPointerUp: handlePushEnd,
          onPointerCancel: handlePushEnd,
          onPointerLeave: handlePushEnd,
        }
      : { onClick: handleToggleClick };

  return (
    <div className={`benz-voice-stack ${className}`}>
      {showPanel && (
        <div className="benz-voice-panel" role="status" aria-live="polite">
          <div className="benz-voice-panel-row">
            {settings.showNoiseMeter && (
              <div className="benz-voice-metric" title="Background noise in the service bay — speak closer to the tablet when high">
                <span className="benz-voice-metric-label">Bay noise</span>
                <div className="benz-voice-noise-track" aria-hidden>
                  <div
                    className="benz-voice-noise-fill"
                    style={{ width: `${noiseLevel}%` }}
                    data-level={noiseLabel(noiseLevel).toLowerCase().replace(/\s+/g, '-')}
                  />
                </div>
                <span className="benz-voice-metric-value">{noiseLevel}% · {noiseLabel(noiseLevel)}</span>
              </div>
            )}

            {settings.showConfidence && (
              <div
                className="benz-voice-metric"
                title={`Recognition confidence — threshold adapts to noise (min ${Math.round(confidenceThreshold * 100)}%)`}
              >
                <span className="benz-voice-metric-label">Confidence</span>
                <span className="benz-voice-metric-value benz-voice-confidence">
                  {formatConfidence(confidence)}
                </span>
              </div>
            )}
          </div>

          {(interimText || committedText) && (
            <div className="benz-voice-transcript-preview">
              {committedText && <span className="benz-voice-transcript-final">{committedText}</span>}
              {interimText && <span className="benz-voice-transcript-interim">{interimText}</span>}
            </div>
          )}

          {listeningState === 'timeout' && (
            <div className="benz-voice-banner benz-voice-banner-warn">
              <span>Listening timed out.</span>
              <button type="button" className="benz-voice-retry-btn" onClick={handleRetry}>
                <RefreshCw size={14} aria-hidden />
                Retry
              </button>
            </div>
          )}

          {listeningState === 'error' && errorMessage && (
            <div className="benz-voice-banner benz-voice-banner-error">
              <span>{errorMessage}</span>
              <button type="button" className="benz-voice-retry-btn" onClick={handleRetry}>
                <RefreshCw size={14} aria-hidden />
                Retry
              </button>
            </div>
          )}

          {permission === 'prompt' && !isListening && (
            <p className="benz-voice-hint">
              First use: allow microphone access when prompted. Manual typing always works.
            </p>
          )}
        </div>
      )}

      <div className="benz-voice-controls">
        <button
          type="button"
          title={micTitle}
          aria-label={micTitle}
          aria-pressed={isListening}
          className={`benz-voice-btn touch-target active:scale-95 ${isListening ? 'benz-voice-btn-active' : ''} ${listeningState === 'restarting' ? 'benz-voice-btn-restarting' : ''}`}
          {...micHandlers}
        >
          <span className="benz-voice-btn-inner">
            {isListening ? (
              <>
                <span className="benz-voice-pulse" aria-hidden />
                <span className="benz-voice-pulse benz-voice-pulse-delay" aria-hidden />
                <MicOff size={18} />
              </>
            ) : (
              <Mic size={18} />
            )}
          </span>
        </button>

        <button
          type="button"
          className={`benz-voice-mode-btn touch-target ${mode === 'push-to-talk' ? 'benz-voice-mode-btn-active' : ''}`}
          title={
            mode === 'push-to-talk'
              ? 'Push-to-talk on — switch to tap toggle'
              : 'Switch to push-to-talk (hold mic while speaking)'
          }
          aria-label={mode === 'push-to-talk' ? 'Disable push-to-talk' : 'Enable push-to-talk'}
          onClick={handleModeSwitch}
        >
          {mode === 'push-to-talk' ? <Hand size={16} /> : <ToggleLeft size={16} />}
        </button>
      </div>

      {!isSupported && (
        <p className="benz-voice-fallback-hint" title="Manual text entry is always available">
          Voice unavailable — type below.
        </p>
      )}
    </div>
  );
}