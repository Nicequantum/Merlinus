import { Settings } from 'lucide-react';
import { DealershipBranding } from '@/components/DealershipBranding';
import { MerlinLogo } from '@/components/MerlinLogo';
import { RepairOrderHomeLists } from '@/components/RepairOrderHomeLists';
import { ScanROSection } from '@/components/ScanROSection';
import type { PendingImage, RepairOrder } from '../types';

interface HomeViewProps {
  technicianName?: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchLoading: boolean;
  searchROs: RepairOrder[];
  todayROs: RepairOrder[];
  previousROs: RepairOrder[];
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
  onCreateManualRO: () => void;
  openingROId: string | null;
  onOpenRO: (ro: RepairOrder) => void;
  onDeleteRO: (id: string) => void;
  onOpenSettings: () => void;
}

export function HomeView({
  technicianName,
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
        <div className="text-center mb-8">
          <div className="benz-logo-ring benz-logo-bubble w-[4.5rem] h-[4.5rem] mx-auto mb-4">
            <MerlinLogo />
          </div>
          <DealershipBranding size="lg" className="mb-2" />
          <p className="text-benz-secondary text-sm">{technicianName || 'Technician'}</p>
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