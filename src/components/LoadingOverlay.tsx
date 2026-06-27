'use client';

import { MerlinLogo } from '@/components/MerlinLogo';

interface LoadingOverlayProps {
  visible: boolean;
  message: string;
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="benz-card-elevated p-7 w-full max-w-sm text-center">
        <div className="benz-logo-ring benz-logo-bubble w-16 h-16 mx-auto mb-4 animate-pulse" aria-hidden="true">
          <MerlinLogo />
        </div>
        <div className="text-sm font-medium text-benz-primary">{message}</div>
        <span className="sr-only">{message}</span>
      </div>
    </div>
  );
}