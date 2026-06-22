'use client';

import { Shield } from 'lucide-react';
import { CONSENT_VERSION } from '@/types';

interface ConsentModalProps {
  onAccept: () => void;
  loading?: boolean;
}

export function ConsentModal({ onAccept, loading }: ConsentModalProps) {
  return (
    <div className="benz-modal-overlay z-[100] p-4">
      <div className="benz-modal-panel sm:max-w-md w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-benz-accent/15 border border-benz-accent/30">
              <Shield size={22} className="text-benz-blue" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Data & Privacy Consent</h2>
              <p className="text-xs text-benz-secondary mt-0.5">Required for dealership use • v{CONSENT_VERSION}</p>
            </div>
          </div>

          <div className="text-sm text-benz-silver space-y-3.5 mb-6 leading-relaxed">
            <p>
              Benz Tech processes repair order data, vehicle identification numbers, diagnostic images, and customer
              information solely to assist authorized Mercedes-Benz technicians in creating warranty documentation.
            </p>
            <p>
              <strong className="text-benz-primary">Customer PII and repair content</strong> (customer name, VIN, complaints, OCR text, technician notes, and warranty stories) is encrypted at rest on the server.
              It is never stored in your browser&apos;s local storage. AI processing occurs server-side; API credentials are
              not exposed to client devices.
            </p>
            <p>
              <strong className="text-benz-primary">Your responsibility:</strong> Only enter data you are authorized to access per
              dealership policy. Warranty stories are generated from documented facts only — verify all output before
              submission to Mercedes-Benz warranty systems.
            </p>
            <p className="text-xs text-benz-secondary">
              By continuing, you confirm you are an authorized dealership employee and agree to these terms.
            </p>
          </div>

          <button onClick={onAccept} disabled={loading} className="primary-btn w-full h-12 text-sm font-semibold touch-target">
            {loading ? 'Saving…' : 'I agree — continue to Benz Tech'}
          </button>
        </div>
      </div>
    </div>
  );
}