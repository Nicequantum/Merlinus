'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { clerkPublishableKeyConfigured } from '@/lib/authModeClient';

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

/** Wraps the app with Clerk when a publishable key is configured. */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
  if (!clerkPublishableKeyConfigured() || !publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}