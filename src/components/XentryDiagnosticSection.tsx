'use client';

import { Camera, FolderOpen, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { ExtractedDataPreview } from '@/components/ExtractedDataPreview';
import { XentryImageGallery } from '@/components/XentryImageGallery';
import type { ExtractedData, ImageAttachment, PendingImage } from '@/types';

interface XentryDiagnosticSectionProps {
  title?: string;
  hint?: string;
  savedImages: ImageAttachment[];
  pendingImages: PendingImage[];
  isProcessing: boolean;
  ocrProgress: number;
  statusMessage: string;
  extractedData?: ExtractedData;
  onCapturePhoto: () => void;
  onAddFromGallery: () => void;
  onProcessImages: () => void;
  onClearPending: () => void;
  onCancelProcessing: () => void;
  onDeleteSavedImage?: (imageId: string) => void;
}

export function XentryDiagnosticSection({
  title = 'XENTRY / Diagnostic Images',
  hint = 'Capture Quick Test screens, fault codes, guided tests, voltmeter readings, and wiring diagrams. Queue multiple photos, then process them together.',
  savedImages,
  pendingImages,
  isProcessing,
  ocrProgress,
  statusMessage,
  extractedData,
  onCapturePhoto,
  onAddFromGallery,
  onProcessImages,
  onClearPending,
  onCancelProcessing,
  onDeleteSavedImage,
}: XentryDiagnosticSectionProps) {
  const hasPending = pendingImages.length > 0;
  const hasSaved = savedImages.length > 0;

  return (
    <div className="benz-card benz-diagnostic-card p-5 min-w-0 w-full">
      <div className="benz-section-title mb-1">{title}</div>
      <p className="benz-hint mb-4 leading-relaxed">{hint}</p>

      {!isProcessing && (
        <div className="space-y-2 mb-3">
          <button
            type="button"
            onClick={onCapturePhoto}
            className="secondary-btn w-full h-13 flex items-center justify-center gap-2.5 text-sm font-medium touch-target"
          >
            <Camera size={18} />
            {hasPending ? 'Add diagnostic photo' : 'Take diagnostic photo'}
          </button>
          <button
            type="button"
            onClick={onAddFromGallery}
            className="secondary-btn w-full h-11 flex items-center justify-center gap-2 text-sm font-medium"
          >
            <FolderOpen size={18} />
            Add from gallery
          </button>
        </div>
      )}

      {hasPending && !isProcessing && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={onProcessImages}
            className="primary-btn flex-[2] h-13 flex items-center justify-center gap-2 text-sm font-semibold touch-target"
          >
            <Sparkles size={18} />
            Process images ({pendingImages.length})
          </button>
          <button
            type="button"
            onClick={onClearPending}
            className="benz-danger-btn flex-1 h-13 flex items-center justify-center gap-2 text-sm"
          >
            <Trash2 size={18} />
            Clear
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="benz-card p-4 mb-3 border border-benz-accent/20">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="benz-section-title text-sm">Diagnostic extraction</div>
            <button
              type="button"
              onClick={onCancelProcessing}
              className="text-xs font-semibold text-benz-amber hover:opacity-80"
            >
              Cancel
            </button>
          </div>
          <div className="benz-progress-track mb-3">
            <div className="benz-progress-fill" style={{ width: `${Math.max(ocrProgress, 4)}%` }} />
          </div>
          <p className="text-xs text-benz-secondary flex items-center gap-2">
            <Loader2 size={14} className="animate-spin shrink-0" />
            {statusMessage || `Analyzing… ${ocrProgress}%`}
          </p>
        </div>
      )}

      {hasPending && (
        <div className="benz-card p-4 mb-3">
          <div className="benz-section-title mb-3 text-sm">
            {isProcessing
              ? `Processing ${pendingImages.length} queued photo${pendingImages.length === 1 ? '' : 's'}`
              : `Queued — ${pendingImages.length} photo${pendingImages.length === 1 ? '' : 's'} ready`}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {pendingImages.map((img) => (
              <div
                key={img.id}
                className="relative rounded-benz overflow-hidden border border-[var(--benz-border)]"
              >
                <img src={img.previewUrl} className="w-full h-20 object-cover" alt={img.name} />
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSaved && (
        <>
          <div className="benz-section-title mb-2 text-sm">Saved diagnostic photos</div>
          <XentryImageGallery images={savedImages} onDeleteImage={onDeleteSavedImage} />
        </>
      )}

      <ExtractedDataPreview data={extractedData} />
    </div>
  );
}