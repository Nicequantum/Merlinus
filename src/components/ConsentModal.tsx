'use client';

import { Shield } from 'lucide-react';
import { CONSENT_VERSION } from '@/types';

interface ConsentModalProps {
  onAccept: () => void;
  loading?: boolean;
}

export function ConsentModal({ onAccept, loading }: ConsentModalProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div className="ios-card p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#0a84ff]/20 flex items-center justify-center">
            <Shield size={20} className="text-[#0a84ff]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Data & Privacy Consent</h2>
            <p className="text-xs text-[#8e8e93]">Required for dealership use • v{CONSENT_VERSION}</p>
          </div>
        </div>

        <div className="text-sm text-[#c7c7cc] space-y-3 mb-6 leading-relaxed">
          <p>
            Benz Tech processes repair order data, vehicle identification numbers, diagnostic images, and customer
            information solely to assist authorized Mercedes-Benz technicians in creating warranty documentation.
          </p>
          <p>
            <strong className="text-white">Customer PII and repair content</strong> (customer name, VIN, complaints, OCR text, technician notes, and warranty stories) is encrypted at rest on the server.
            It is never stored in your browser&apos;s local storage. AI processing occurs server-side; API credentials are
            not exposed to client devices.
          </p>
          <p>
            <strong className="text-white">Your responsibility:</strong> Only enter data you are authorized to access per
            dealership policy. Warranty stories are generated from documented facts only — verify all output before
            submission to Mercedes-Benz warranty systems.
          </p>
          <p className="text-xs text-[#8e8e93]">
            By continuing, you confirm you are an authorized dealership employee and agree to these terms.
          </p>
        </div>

        <button onClick={onAccept} disabled={loading} className="primary-btn w-full h-12 text-sm font-semibold">
          {loading ? 'SAVING...' : 'I AGREE — CONTINUE TO BENZ TECH'}
        </button>
      </div>
    </div>
  );
}