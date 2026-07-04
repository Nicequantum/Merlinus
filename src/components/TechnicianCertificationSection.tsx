'use client';

import { Shield } from 'lucide-react';
import { StableInput } from '@/components/StableInput';

const CERTIFICATION_DISCLAIMER =
  'I have personally reviewed and edited the AI-assisted warranty story above. I confirm that it accurately reflects the diagnosis, testing, and repairs performed on this vehicle. I take full responsibility for the accuracy and truthfulness of this claim.';

interface TechnicianCertificationSectionProps {
  lineId: string;
  checked: boolean;
  certifiedName: string;
  onCheckedChange: (checked: boolean) => void;
  onNameChange: (name: string) => void;
  isComplete: boolean;
  isSaved: boolean;
}

export function TechnicianCertificationSection({
  lineId,
  checked,
  certifiedName,
  onCheckedChange,
  onNameChange,
  isComplete,
  isSaved,
}: TechnicianCertificationSectionProps) {
  return (
    <div className="benz-card p-4 mt-4 border border-benz-accent/25 bg-benz-accent/5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-benz-blue shrink-0" />
        <div className="benz-section-title">Technician Certification &amp; Approval</div>
      </div>

      <p className="text-sm text-benz-silver leading-relaxed mb-4">{CERTIFICATION_DISCLAIMER}</p>

      <label className="flex items-start gap-3 cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={isSaved}
          className="mt-1 h-4 w-4 shrink-0 accent-benz-blue"
        />
        <span className="text-sm text-benz-primary leading-snug">I have reviewed and verified this story</span>
      </label>

      <div>
        <label className="benz-label mb-2" htmlFor={`certify-name-${lineId}`}>
          Type your full name to certify
        </label>
        <StableInput
          id={`certify-name-${lineId}`}
          fieldKey={`${lineId}-certify-name`}
          value={certifiedName}
          onChange={onNameChange}
          disabled={isSaved}
          placeholder="Full legal name"
          className="benz-input w-full"
          autoComplete="name"
        />
      </div>

      {!isComplete && !isSaved && (
        <p className="text-xs text-benz-amber mt-3 leading-snug">
          MI audit is complete. Check the box and enter your full name to certify — Copy for CDK stays
          locked until certification is saved.
        </p>
      )}

      {isSaved && (
        <p className="text-xs text-benz-green mt-3 leading-snug flex items-center gap-1.5">
          <Shield size={12} /> Story certified and saved.
        </p>
      )}
    </div>
  );
}