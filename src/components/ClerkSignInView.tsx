'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { DealershipBranding } from '@/components/DealershipBranding';
import { MerlinLogoMark } from '@/components/MerlinLogoMark';

interface ClerkSignInViewProps {
  showLegacyLink?: boolean;
}

export function ClerkSignInView({ showLegacyLink = false }: ClerkSignInViewProps) {
  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="merlin-brand-hero login-brand">
          <MerlinLogoMark size="lg" animated />
          <p className="merlin-wordmark">
            Merlinus
            <span className="merlin-wordmark-accent">Warranty Intelligence</span>
          </p>
          <div className="merlin-brand-divider" aria-hidden="true" />
          <DealershipBranding size="lg" />
        </div>

        <div className="clerk-sign-in-root benz-card-elevated benz-card-elevated-accent">
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl={undefined}
            appearance={{
              variables: {
                colorPrimary: '#00adef',
                borderRadius: '14px',
              },
              elements: {
                rootBox: 'clerk-sign-in-box',
                card: 'clerk-sign-in-card',
                headerTitle: 'clerk-sign-in-title',
                headerSubtitle: 'clerk-sign-in-subtitle',
                formButtonPrimary: 'primary-btn clerk-sign-in-primary-btn',
                formFieldInput: 'benz-input',
                footerActionLink: 'clerk-sign-in-link',
              },
            }}
          />
        </div>

        {showLegacyLink ? (
          <p className="login-footer">
            <Link href="/" className="login-alt-link">
              Sign in with D7 number instead
            </Link>
          </p>
        ) : (
          <p className="login-footer">Authorized dealership personnel only.</p>
        )}
      </div>
    </div>
  );
}