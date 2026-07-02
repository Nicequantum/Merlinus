'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  BookmarkPlus,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { StableInput } from '@/components/StableInput';
import { StableTextarea } from '@/components/StableTextarea';
import { XentryDiagnosticSection } from '@/components/XentryDiagnosticSection';
import { SaveTemplateModal } from '@/components/SaveTemplateModal';
import {
  StoryQualityLoadingPanel,
  StoryQualityPanel,
  StoryQualityStaleBanner,
} from '@/components/StoryQualityPanel';
import { SoldMetricsSummary } from '@/components/SoldMetricsSummary';
import { TemplateLibraryModal } from '@/components/TemplateLibraryModal';
import { hasSoldMetrics } from '@/lib/repairLineSoldMetrics';
import { BenzEmptyState } from '@/components/BenzEmptyState';
import { TechnicianCertificationSection } from '@/components/TechnicianCertificationSection';
import type { StoryCertificationRecord } from '@/hooks/repairOrders/useROStoryWorkflow';
import { isCustomerPayRepairLine } from '@/lib/customerPayLine';
import type {
  ImageAttachment,
  PendingImage,
  RepairLine,
  RepairOrder,
  StoryQualityResult,
  StoryReviewResult,
  TemplateCategory,
} from '@/types';
import { WARRANTY_STORY_MAX_CHARS } from '@/types';
import { useLineViewCertificationForm } from '@/hooks/lineView/useLineViewCertificationForm';
import { useLineViewPdfExport } from '@/hooks/lineView/useLineViewPdfExport';
import { useStoryGenerationPhase } from '@/hooks/useStoryGenerationPhase';
import {
  charCountColor,
  complaintLabel,
  getWarrantyStoryTextareaValue,
  readWarrantyStoryText,
} from '@/lib/lineViewUtils';
import { copyFormattedStory } from '@/utils/pdfExport';

interface LineViewProps {
  ro: RepairOrder;
  line: RepairLine;
  technicianName?: string;
  isProcessingOCR: boolean;
  ocrProgress: number;
  isGenerating: boolean;
  isScoring: boolean;
  isReviewing: boolean;
  storyQuality: StoryQualityResult | null;
  storyReview: StoryReviewResult | null;
  storyQualityStale: boolean;
  storyCertification: StoryCertificationRecord | null;
  isCertifyingStory: boolean;
  lastGeneratedStoryText: string | null;
  cdkSanitizedNotice?: boolean;
  onClearCdkSanitizedNotice?: () => void;
  onBack: () => void;
  onUpdateLine: (updates: Partial<RepairLine>) => void;
  xentrySavedImages: ImageAttachment[];
  xentryPendingImages: PendingImage[];
  xentryStatusMessage: string;
  onCaptureXentryPhoto: () => void;
  onAddXentryFromGallery: () => void;
  onProcessXentryImages: () => void;
  onClearPendingXentry: () => void;
  onCancelXentryProcessing: () => void;
  onDeleteXentryImage: (imageId: string) => void;
  onGenerateStory: () => void;
  onScoreStory: (storyText?: string) => void | Promise<void>;
  onReviewStory: (storyText?: string) => void | Promise<void>;
  onApplyCustomerPayTemplate: (templateId: string) => void | Promise<void>;
  onClearCustomerPayMode?: () => void | Promise<void>;
  onAcknowledgeStoryBaseline: (text: string) => void;
  onCertifyAndSaveStory: (storyText: string, certifiedByName: string) => void | Promise<void>;
}

export function LineView({
  ro,
  line,
  technicianName,
  isProcessingOCR,
  ocrProgress,
  isGenerating,
  isScoring,
  isReviewing,
  storyQuality,
  storyReview,
  storyQualityStale,
  storyCertification,
  isCertifyingStory,
  lastGeneratedStoryText,
  cdkSanitizedNotice = false,
  onClearCdkSanitizedNotice,
  onBack,
  onUpdateLine,
  xentrySavedImages,
  xentryPendingImages,
  xentryStatusMessage,
  onCaptureXentryPhoto,
  onAddXentryFromGallery,
  onProcessXentryImages,
  onClearPendingXentry,
  onCancelXentryProcessing,
  onDeleteXentryImage,
  onGenerateStory,
  onScoreStory,
  onReviewStory,
  onApplyCustomerPayTemplate,
  onClearCustomerPayMode,
  onAcknowledgeStoryBaseline,
  onCertifyAndSaveStory,
}: LineViewProps) {
  const isCustomerPayLine = isCustomerPayRepairLine(line);
  const vehicleSummary = [ro.vehicle.year, ro.vehicle.make, ro.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  const mileageStr = ro.vehicle.mileageIn ? `${ro.vehicle.mileageIn} mi` : '';
  const storyLen = line.warrantyStory?.length ?? 0;
  const generationPhase = useStoryGenerationPhase(isGenerating);
  const advisorName = ro.serviceAdvisor?.displayName || ro.serviceAdvisorName;
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  const {
    certificationChecked,
    setCertificationChecked,
    certificationName,
    setCertificationName,
    showCertificationSection,
    certificationPendingReaudit,
    isStoryCertified,
    isCertificationComplete,
    certificationActionsLocked,
  } = useLineViewCertificationForm({
    lineId: line.id,
    isCustomerPayLine,
    technicianName,
    storyQuality,
    storyQualityStale,
    storyCertification,
    lastGeneratedStoryText,
  });

  useEffect(() => {
    setShowSaveTemplate(false);
    setShowTemplateLibrary(false);
  }, [line.id]);

  const canSaveAsTemplate = useMemo(() => {
    return Boolean(lastGeneratedStoryText && line.warrantyStory?.trim());
  }, [lastGeneratedStoryText, line.warrantyStory]);

  const defaultTemplateTitle = useMemo(() => {
    const base = line.description?.trim() || 'Warranty Story';
    return base.length > 80 ? `${base.slice(0, 77)}…` : base;
  }, [line.description]);

  const handleInsertTemplate = (content: string, _title: string, category: TemplateCategory) => {
    // Warranty templates append to the story field — Customer Pay uses onApplyCustomerPayTemplate instead.
    if (category === 'customer') return;
    const existing = line.warrantyStory?.trim();
    const next = existing ? `${existing}\n\n${content}` : content;
    onUpdateLine({ warrantyStory: next });
  };

  const handleCopy = async () => {
    const storyText = getWarrantyStoryTextareaValue(line.id, line.warrantyStory);
    if (!storyText.trim()) return;
    try {
      const { wasModified } = await copyFormattedStory(ro, line, storyText);
      if (wasModified) {
        toast.message('Story cleaned for CDK compatibility');
      }
      toast.success('Story copied — ready to paste into CDK');
    } catch {
      toast.error('Clipboard copy failed');
    }
  };

  const readStoryText = () => readWarrantyStoryText(line.id, line.warrantyStory);

  const handleGenerateStory = () => {
    void onGenerateStory();
  };

  const handleScoreStory = () => {
    void onScoreStory(readStoryText());
  };

  const handleReviewStory = () => {
    void onReviewStory(readStoryText());
  };

  const handleCertifyAndSave = () => {
    if (!isCertificationComplete || isStoryCertified || certificationPendingReaudit) return;
    void onCertifyAndSaveStory(readStoryText(), certificationName.trim());
  };

  const handlePdf = useLineViewPdfExport({ ro, line, technicianName, isCustomerPayLine });

  return (
    <div className="benz-page pb-12">
      <button onClick={onBack} className="benz-nav-back">
        <ArrowLeft size={18} /> Back to RO
      </button>

      <div className="benz-vehicle-bar benz-vehicle-bar-luxury mb-8">
        <div className="text-sm font-semibold tracking-tight text-benz-primary">
          {vehicleSummary}
          {mileageStr ? ` · ${mileageStr}` : ''}
          {ro.vehicle.vin ? ` · VIN ${ro.vehicle.vin.slice(0, 10)}…` : ''}
        </div>
        {ro.vehicle.engine && <div className="text-xs text-benz-secondary mt-1">Engine: {ro.vehicle.engine}</div>}
        {ro.complaints && ro.complaints.length > 0 && (
          <div className="mt-2 text-xs text-benz-secondary leading-relaxed">
            Complaints:{' '}
            {ro.complaints
              .map((c, i) => `${complaintLabel(ro.complaintLabels, i)}. ${c.slice(0, 42)}${c.length > 42 ? '…' : ''}`)
              .join('  ')}
          </div>
        )}
      </div>

      <div className="mb-6">
        <label className="benz-label mb-2">Line {line.lineNumber} description</label>
        <div className="benz-line-title-field flex gap-2 items-center min-w-0">
          <StableInput
            fieldKey={`${line.id}-description`}
            value={line.description}
            onChange={(v) => onUpdateLine({ description: v })}
            showVoice
            placeholder="Repair line description"
            className="benz-line-title-input flex-1 min-w-0"
          />
        </div>
      </div>

      <div className="benz-line-flow">
        <div className="benz-card benz-line-doc-card min-w-0 w-full">
          <label className="benz-label">Customer concern</label>
          <p className="benz-hint mb-3">Prefilled from scan — edit to match advisor wording</p>
          <div className="benz-complaint-field">
            <StableTextarea
              fieldKey={`${line.id}-concern`}
              value={line.customerConcern}
              onChange={(v) => onUpdateLine({ customerConcern: v })}
              className="benz-textarea min-h-[80px]"
              placeholder="Customer stated..."
            />
          </div>

          <div className="benz-line-doc-divider" />

          <label className="benz-label">Technician notes & findings</label>
          <div className="benz-complaint-field">
            <StableTextarea
              fieldKey={`${line.id}-notes`}
              value={line.technicianNotes}
              onChange={(v) => onUpdateLine({ technicianNotes: v })}
              className="benz-textarea min-h-[100px]"
              placeholder="Document actual test results, findings, and repair steps performed..."
            />
          </div>
        </div>

        <XentryDiagnosticSection
          title="Diagnostic Evidence"
          hint="Capture Xentry screens, fault codes, guided tests, and voltmeter readings. Queue multiple photos, then process them together for story generation."
          savedImages={xentrySavedImages}
          pendingImages={xentryPendingImages}
          isProcessing={isProcessingOCR}
          ocrProgress={ocrProgress}
          statusMessage={xentryStatusMessage}
          extractedData={line.extractedData}
          onCapturePhoto={onCaptureXentryPhoto}
          onAddFromGallery={onAddXentryFromGallery}
          onProcessImages={onProcessXentryImages}
          onClearPending={onClearPendingXentry}
          onCancelProcessing={onCancelXentryProcessing}
          onDeleteSavedImage={onDeleteXentryImage}
        />

        {advisorName && (
          <div className="benz-line-aside border-benz-accent/25 bg-benz-accent/5">
            <div className="flex items-center gap-2 text-benz-blue text-xs font-semibold">
              <Sparkles size={14} />
              Advisor Intelligence Active
            </div>
            <p className="text-xs text-benz-secondary mt-2 leading-relaxed">
              Story generation will match {advisorName}&apos;s complaint phrasing style for this RO.
            </p>
          </div>
        )}

        {hasSoldMetrics(line.soldMetrics) && line.soldMetrics ? (
          <SoldMetricsSummary metrics={line.soldMetrics} />
        ) : null}

        <div className="benz-generate-panel space-y-3 relative z-[5]">
          {isCustomerPayLine ? (
            <div className="benz-cp-instant-banner flex items-start gap-3 p-4 rounded-xl border border-benz-green/30 bg-benz-green/8">
              <Zap size={20} className="text-benz-green shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-benz-primary">Customer Pay — instant story</div>
                <p className="text-xs text-benz-secondary mt-1 leading-relaxed">
                  Pre-written narrative applied. No AI generation or quality audit required — edit and copy to CDK.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGenerateStory}
                disabled={isGenerating || isScoring || isReviewing}
                className="primary-btn w-full h-13 text-base flex items-center justify-center gap-2.5 disabled:opacity-50 touch-target"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    {generationPhase.message}
                  </>
                ) : (
                  'Generate MI 4.3'
                )}
              </button>
              {isGenerating && (
                <div className="benz-gen-progress" role="progressbar" aria-valuenow={Math.round(generationPhase.progress)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="benz-gen-progress-bar" style={{ width: `${generationPhase.progress}%` }} />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => setShowTemplateLibrary(true)}
              disabled={isGenerating || isScoring || isReviewing}
              className="benz-tertiary-link disabled:opacity-50"
            >
              {isCustomerPayLine ? 'Change Customer Pay template' : 'Browse template library'}
            </button>
            {isCustomerPayLine && onClearCustomerPayMode && (
              <div className="benz-cp-switch-banner w-full">
                <p className="text-xs text-benz-secondary leading-relaxed">
                  Need a full warranty narrative with AI quality review?
                </p>
                <button
                  type="button"
                  onClick={() => void onClearCustomerPayMode()}
                  disabled={isGenerating || isScoring || isReviewing}
                  className="secondary-btn benz-btn-accent-outline h-10 w-full mt-2 text-sm font-medium disabled:opacity-50"
                >
                  Switch to warranty AI
                </button>
              </div>
            )}
            {canSaveAsTemplate && lastGeneratedStoryText && (
              <button
                type="button"
                onClick={() => setShowSaveTemplate(true)}
                disabled={isGenerating || isScoring || isReviewing}
                className="benz-tertiary-link text-benz-green disabled:opacity-50"
              >
                Save as template
              </button>
            )}
          </div>

          <p className="benz-hint text-center">
            {isCustomerPayLine
              ? 'Customer Pay templates skip AI — pick another template or edit the story below.'
              : 'Generate MI 4.3–ready stories, review with AI, edit, then save to grow your knowledge base.'}
          </p>
          {isGenerating && !isCustomerPayLine && !line.warrantyStory?.trim() && (
            <StoryQualityLoadingPanel
              mode="generating"
              statusMessage={generationPhase.message}
              progress={generationPhase.progress}
            />
          )}
        </div>

        {!line.warrantyStory?.trim() && (
          <BenzEmptyState
            icon={isCustomerPayLine ? Zap : Sparkles}
            title={isCustomerPayLine ? 'No Customer Pay story yet' : 'No warranty story yet'}
            hint={
              isCustomerPayLine
                ? 'Pick an instant template from the library — no AI wait time.'
                : 'Generate with Grok or browse templates to start your 3 C\'s narrative.'
            }
            actionLabel={isCustomerPayLine ? 'Browse Customer Pay templates' : 'Generate MI 4.3'}
            onAction={() => (isCustomerPayLine ? setShowTemplateLibrary(true) : handleGenerateStory())}
            className="benz-story-empty-state"
          />
        )}

        {line.warrantyStory && (
          <div className={`story-card p-5 sm:p-6 min-w-0 w-full ${isCustomerPayLine ? 'story-card-cp' : ''}`}>
            <div className="flex justify-between items-start gap-3 mb-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="benz-section-title tracking-[0.12em]">
                  {isCustomerPayLine ? 'Customer Pay Story' : "Warranty Story · 3 C's"}
                </div>
                {isCustomerPayLine && (
                  <span className="benz-cp-badge">
                    <FileText size={12} /> Customer Pay · Instant
                  </span>
                )}
              </div>
              <div className={`text-xs font-mono font-medium ${charCountColor(storyLen)}`}>
                {storyLen} / {WARRANTY_STORY_MAX_CHARS}
              </div>
            </div>
            {storyLen > WARRANTY_STORY_MAX_CHARS && (
              <div className="text-xs text-benz-red mb-3 bg-benz-red/10 border border-benz-red/20 rounded-lg px-3 py-2">
                Exceeds recommended DMS character limit — edit before submission.
              </div>
            )}
            {cdkSanitizedNotice && (
              <div className="text-xs text-benz-amber mb-3 bg-benz-amber/10 border border-benz-amber/25 rounded-lg px-3 py-2">
                Story cleaned for CDK compatibility
              </div>
            )}
            <div className="benz-complaint-field">
              <StableTextarea
                id={`warranty-story-${line.id}`}
                fieldKey={`${line.id}-story`}
                value={line.warrantyStory}
                onChange={(v) => {
                  onClearCdkSanitizedNotice?.();
                  onUpdateLine({ warrantyStory: v });
                }}
                className="benz-textarea text-[15px] leading-relaxed mb-4 min-h-[220px]"
                placeholder="Edit warranty story before DMS submission..."
              />
            </div>
            {!isCustomerPayLine && (
              <div className="benz-quality-inset">
                {isGenerating && (
                  <StoryQualityLoadingPanel
                    mode="generating"
                    statusMessage={generationPhase.message}
                    progress={generationPhase.progress}
                  />
                )}
                {!isGenerating && isScoring && <StoryQualityLoadingPanel mode="scoring" />}
                {!isGenerating && !isScoring && isReviewing && <StoryQualityLoadingPanel mode="reviewing" />}
                {!isGenerating && !isScoring && !isReviewing && storyQuality && (
                  <StoryQualityPanel
                    quality={storyQuality}
                    review={storyReview}
                    panelKey={`${line.id}:${storyQuality.scoredAgainstStory ?? ''}:${storyQuality.score}`}
                  />
                )}
                {!isGenerating && !isScoring && !isReviewing && !storyQuality && storyQualityStale && (
                  <StoryQualityStaleBanner onAudit={handleScoreStory} />
                )}
              </div>
            )}

            {showCertificationSection && (
              <TechnicianCertificationSection
                lineId={line.id}
                checked={certificationChecked}
                certifiedName={certificationName}
                onCheckedChange={setCertificationChecked}
                onNameChange={setCertificationName}
                isComplete={isCertificationComplete}
                isSaved={isStoryCertified}
                pendingReaudit={certificationPendingReaudit}
              />
            )}

            <div className="mt-4 pt-4 benz-divider space-y-3">
              <div className={`grid gap-2.5 ${showCertificationSection ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={certificationActionsLocked}
                  className="primary-btn w-full h-13 flex items-center justify-center gap-2.5 text-sm touch-target disabled:opacity-50"
                >
                  <Copy size={18} />
                  Copy for CDK
                </button>
                {showCertificationSection && (
                  <button
                    type="button"
                    onClick={handleCertifyAndSave}
                    disabled={
                      !isCertificationComplete ||
                      isCertifyingStory ||
                      isStoryCertified ||
                      certificationPendingReaudit
                    }
                    className="secondary-btn benz-btn-accent-outline h-13 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isCertifyingStory ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save size={18} /> Save
                      </>
                    )}
                  </button>
                )}
              </div>

              {!isCustomerPayLine && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleScoreStory}
                      disabled={isGenerating || isScoring || isReviewing || !(line.warrantyStory?.trim())}
                      className="secondary-btn benz-btn-accent-outline h-12 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                      {isScoring ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Auditing…
                        </>
                      ) : (
                        <>
                          <Shield size={16} /> Audit Story
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateStory}
                      disabled={isGenerating || isScoring || isReviewing}
                      className="secondary-btn h-12 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      Regenerate
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleReviewStory}
                    disabled={isGenerating || isScoring || isReviewing || !(line.warrantyStory?.trim())}
                    className="secondary-btn h-11 w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isReviewing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Reviewing…
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} /> Review with AI
                      </>
                    )}
                  </button>
                </>
              )}

              <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTemplateLibrary(true)}
                  className="benz-tertiary-btn"
                >
                  <BookOpen size={14} /> Templates
                </button>
                {canSaveAsTemplate && (
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplate(true)}
                    className="benz-tertiary-btn text-benz-green"
                  >
                    <BookmarkPlus size={14} /> Save template
                  </button>
                )}
                <button type="button" onClick={handlePdf} className="benz-tertiary-btn">
                  <Download size={14} /> Export PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <TemplateLibraryModal
        key={libraryRefreshKey}
        open={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
        onInsert={handleInsertTemplate}
        onApplyCustomerPay={onApplyCustomerPayTemplate}
        defaultTab={isCustomerPayLine ? 'customer' : 'warranty'}
      />

      {lastGeneratedStoryText && (
        <SaveTemplateModal
          open={showSaveTemplate}
          onClose={() => setShowSaveTemplate(false)}
          onSaved={(_title, savedText) => {
            onAcknowledgeStoryBaseline(savedText);
            setLibraryRefreshKey((k) => k + 1);
          }}
          defaultTitle={defaultTemplateTitle}
          defaultCategory="warranty"
          storyText={line.warrantyStory || ''}
          generatedText={lastGeneratedStoryText}
          lineDescription={line.description}
          vehicleMake={ro.vehicle.make}
          vehicleModel={ro.vehicle.model}
          codes={line.extractedData?.codes}
          repairOrderId={ro.id}
          lineId={line.id}
        />
      )}
    </div>
  );
}