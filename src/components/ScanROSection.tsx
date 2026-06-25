import { Camera, FolderOpen, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { PendingImage } from '@/types';

interface ScanROSectionProps {
  pendingROImages: PendingImage[];
  isProcessingOCR: boolean;
  ocrProgress: number;
  scanStatusMessage: string;
  onScanRO: () => void;
  onAddFromGallery: () => void;
  onProcessScan: () => void;
  onClearPendingScan: () => void;
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
  onAddFromGallery,
  onProcessScan,
  onClearPendingScan,
  onCancelScan,
  onCreateManualRO,
  scanButtonLabel = 'Scan RO',
  compact = false,
}: ScanROSectionProps) {
  const buttonHeight = compact ? 'h-11' : 'h-13';
  const buttonText = compact ? 'text-xs' : 'text-sm';
  const hasPending = pendingROImages.length > 0;

  return (
    <div className="mb-5">
      {!isProcessingOCR && (
        <div className="space-y-2 mb-3">
          <button
            onClick={onScanRO}
            className={`primary-btn w-full ${buttonHeight} flex items-center justify-center gap-2 ${buttonText} font-semibold touch-target`}
          >
            <Camera size={compact ? 16 : 18} />
            {hasPending ? 'Add page' : scanButtonLabel}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onAddFromGallery}
              className={`secondary-btn flex-1 ${compact ? 'h-10' : 'h-11'} flex items-center justify-center gap-2 ${buttonText} font-medium`}
            >
              <FolderOpen size={compact ? 16 : 18} />
              Gallery
            </button>
            <button
              onClick={onCreateManualRO}
              className={`benz-tertiary-btn flex-1 ${compact ? 'h-10' : 'h-11'}`}
            >
              <Plus size={compact ? 16 : 18} />
              {compact ? 'Manual' : 'Manual entry'}
            </button>
          </div>
        </div>
      )}

      {isProcessingOCR && (
        <div className="flex gap-2 mb-3">
          <button
            disabled
            className={`primary-btn w-full ${buttonHeight} flex items-center justify-center gap-2 ${buttonText} font-semibold opacity-60`}
          >
            <Loader2 size={compact ? 16 : 18} className="animate-spin" />
            Scanning… {ocrProgress}%
          </button>
        </div>
      )}

      {hasPending && !isProcessingOCR && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={onProcessScan}
            disabled={isProcessingOCR}
            className={`primary-btn flex-[2] ${buttonHeight} flex items-center justify-center gap-2 ${buttonText} font-semibold`}
          >
            <Sparkles size={compact ? 16 : 18} />
            Process RO ({pendingROImages.length} page{pendingROImages.length === 1 ? '' : 's'})
          </button>
          <button
            onClick={onClearPendingScan}
            className={`benz-danger-btn flex-1 ${buttonHeight} flex items-center justify-center gap-2 ${buttonText}`}
          >
            <Trash2 size={compact ? 16 : 18} />
            Clear
          </button>
        </div>
      )}

      {isProcessingOCR && (
        <div className="benz-card p-4 mb-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="benz-section-title">Scan in progress</div>
            <button onClick={onCancelScan} className="text-xs font-semibold text-benz-amber hover:opacity-80">
              Cancel
            </button>
          </div>
          <div className="benz-progress-track mb-3">
            <div className="benz-progress-fill" style={{ width: `${Math.max(ocrProgress, 4)}%` }} />
          </div>
          <p className="text-xs text-benz-secondary">{scanStatusMessage || 'Processing documents…'}</p>
        </div>
      )}

      {hasPending && (
        <div className="benz-card p-4 mb-3">
          <div className="benz-section-title mb-3">
            {isProcessingOCR
              ? `Processing ${pendingROImages.length} page${pendingROImages.length === 1 ? '' : 's'}`
              : `Ready — ${pendingROImages.length} page${pendingROImages.length === 1 ? '' : 's'} captured`}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {pendingROImages.map((img) => (
              <div key={img.id} className="relative rounded-benz overflow-hidden border border-[var(--benz-border)]">
                <img src={img.previewUrl} className="w-full h-20 object-cover" alt={img.name} />
                {isProcessingOCR && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isProcessingOCR && !hasPending && (
        <p className="text-center benz-hint -mt-1 mb-2 px-2">
          Capture each RO page (usually 3–5). Use even lighting and avoid shadows on colored paper. Add from Gallery for PDFs.
          Tap Process RO when all pages are captured.
        </p>
      )}
    </div>
  );
}