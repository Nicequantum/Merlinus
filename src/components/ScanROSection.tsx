import { Camera, Loader2, Plus } from 'lucide-react';
import type { PendingImage } from '@/types';

interface ScanROSectionProps {
  pendingROImages: PendingImage[];
  isProcessingOCR: boolean;
  ocrProgress: number;
  scanStatusMessage: string;
  onScanRO: () => void;
  onCancelScan: () => void;
  onCreateManualRO: () => void;
  scanButtonLabel?: string;
  compact?: boolean;
}

export function ScanROSection({
  pendingROImages,
  isProcessingOCR,
  ocrProgress,
  scanStatusMessage,
  onScanRO,
  onCancelScan,
  onCreateManualRO,
  scanButtonLabel = 'SCAN RO',
  compact = false,
}: ScanROSectionProps) {
  const buttonHeight = compact ? 'h-11' : 'h-12';
  const buttonText = compact ? 'text-xs' : 'text-sm';

  return (
    <div className="mb-4">
      <div className="flex gap-2 mb-2">
        <button
          onClick={onScanRO}
          disabled={isProcessingOCR}
          className={`primary-btn flex-1 ${buttonHeight} flex items-center justify-center gap-2 ${buttonText} font-semibold disabled:opacity-60`}
        >
          {isProcessingOCR ? (
            <>
              <Loader2 size={compact ? 16 : 18} className="animate-spin" />
              SCANNING… {ocrProgress}%
            </>
          ) : (
            <>
              <Camera size={compact ? 16 : 18} />
              {scanButtonLabel}
            </>
          )}
        </button>
        <button
          onClick={onCreateManualRO}
          disabled={isProcessingOCR}
          className={`secondary-btn flex-1 ${buttonHeight} flex items-center justify-center gap-2 ${buttonText} font-semibold disabled:opacity-60`}
        >
          <Plus size={compact ? 16 : 18} />
          {compact ? 'MANUAL RO' : 'NEW MANUAL'}
        </button>
      </div>

      {isProcessingOCR && (
        <div className="ios-card p-3 mb-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs uppercase tracking-widest text-[#8e8e93]">Scan in progress</div>
            <button onClick={onCancelScan} className="text-[10px] text-[#ff9f0a] font-semibold">
              CANCEL
            </button>
          </div>
          <div className="h-1.5 bg-[#2c2c2e] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-[#0a84ff] transition-all duration-300 ease-out"
              style={{ width: `${Math.max(ocrProgress, 4)}%` }}
            />
          </div>
          <p className="text-xs text-[#8e8e93]">{scanStatusMessage || 'Processing documents…'}</p>
        </div>
      )}

      {pendingROImages.length > 0 && (
        <div className="ios-card p-3 mb-2">
          <div className="text-xs uppercase tracking-widest text-[#8e8e93] mb-2">
            {isProcessingOCR
              ? `PROCESSING ${pendingROImages.length} PAGE${pendingROImages.length === 1 ? '' : 'S'}`
              : `READY — ${pendingROImages.length} PAGE${pendingROImages.length === 1 ? '' : 'S'}`}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {pendingROImages.map((img) => (
              <div key={img.id} className="relative">
                <img
                  src={img.previewUrl}
                  className="w-full h-16 object-cover rounded border border-[#38383a]"
                  alt={img.name}
                />
                {isProcessingOCR && (
                  <div className="absolute inset-0 bg-black/40 rounded flex items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isProcessingOCR && pendingROImages.length === 0 && (
        <p className="text-center text-[10px] text-[#8e8e93] -mt-1 mb-1">
          Tap {scanButtonLabel} to capture or select multiple RO pages, VMI sheets, customer photos, or PDFs. Processing
          starts automatically.
        </p>
      )}
    </div>
  );
}