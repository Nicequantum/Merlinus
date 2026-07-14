import { Settings } from 'lucide-react';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import { DealershipBranding } from '@/components/DealershipBranding';
import { RepairOrderHomeLists } from '@/components/RepairOrderHomeLists';
import { ScanROSection } from '@/components/ScanROSection';
import type { PendingImage, RepairOrderSummary } from '../types';

interface HomeViewProps {
  technicianName?: string;
  /** Session rooftop name from provision (`Dealership.name`). */
  dealershipName?: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchLoading: boolean;
  searchROs: RepairOrderSummary[];
  todayROs: RepairOrderSummary[];
  previousROs: RepairOrderSummary[];
  previousExpanded: boolean;
  onTogglePrevious: () => void;
  previousLoading: boolean;
  previousLoadingMore: boolean;
  previousHasMore: boolean;
  onLoadMorePrevious: () => void;
  pendingROImages: PendingImage[];
  isProcessingOCR: boolean;
  ocrProgress: number;
  scanStatusMessage: string;
  onScanRO: () => void;
  onAddFromGallery: () => void;
  onProcessScan: () => void;
  onClearPendingScan: () => void;
  onCancelScan: () => void;
  onDeletePendingPage?: (imageId: string) => void;
  onCreateManualRO: () => void;
  openingROId: string | null;
  onOpenRO: (ro: RepairOrderSummary) => void;
  onDeleteRO: (id: string) => void;
  onOpenSettings: () => void;
}

export function HomeView({
  technicianName,
  dealershipName,
  searchTerm,
  onSearchChange,
  searchLoading,
  searchROs,
  todayROs,
  previousROs,
  previousExpanded,
  onTogglePrevious,
  previousLoading,
  previousLoadingMore,
  previousHasMore,
  onLoadMorePrevious,
  pendingROImages,
  isProcessingOCR,
  ocrProgress,
  scanStatusMessage,
  onScanRO,
  onAddFromGallery,
  onProcessScan,
  onClearPendingScan,
  onCancelScan,
  onDeletePendingPage,
  onCreateManualRO,
  openingROId,
  onOpenRO,
  onDeleteRO,
  onOpenSettings,
}: HomeViewProps) {
  return (
    <div className="relative min-h-dvh benz-page-compact">
      <button
        onClick={onOpenSettings}
        className="absolute top-4 right-4 benz-icon-btn z-10 touch-target"
        aria-label="Settings"
      >
        <Settings size={22} />
      </button>

      <div className="pt-10">
        <div className="merlin-brand-hero mb-8">
          <ApexLogoMark size="lg" className="mb-1" title="Apex" />
          <div className="merlin-brand-divider" aria-hidden="true" />
          <DealershipBranding size="lg" className="mb-2" displayName={dealershipName} />
          <p className="text-benz-secondary text-sm font-medium">{technicianName || 'Technician'}</p>
        </div>

        <ScanROSection
          pendingROImages={pendingROImages}
          isProcessingOCR={isProcessingOCR}
          ocrProgress={ocrProgress}
          scanStatusMessage={scanStatusMessage}
          onScanRO={onScanRO}
          onAddFromGallery={onAddFromGallery}
          onProcessScan={onProcessScan}
          onClearPendingScan={onClearPendingScan}
          onCancelScan={onCancelScan}
          onDeletePendingPage={onDeletePendingPage}
          onCreateManualRO={onCreateManualRO}
          scanButtonLabel="Scan RO"
        />

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search past ROs (number, model, VIN)…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="benz-search"
          />
        </div>

        <RepairOrderHomeLists
          searchTerm={searchTerm}
          searchLoading={searchLoading}
          searchResults={searchROs}
          todayROs={todayROs}
          previousROs={previousROs}
          previousExpanded={previousExpanded}
          onTogglePrevious={onTogglePrevious}
          previousLoading={previousLoading}
          previousLoadingMore={previousLoadingMore}
          previousHasMore={previousHasMore}
          onLoadMorePrevious={onLoadMorePrevious}
          openingROId={openingROId}
          onOpenRO={onOpenRO}
          onDeleteRO={onDeleteRO}
        />
      </div>
    </div>
  );
}