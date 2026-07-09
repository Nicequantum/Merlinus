'use client';

import { Suspense } from 'react';
import { BenzTechApp } from '@/components/BenzTechApp';
import { LoadingScreen } from '@/components/LoadingScreen';

/** Client entry for / — avoids next/dynamic + ssr:false pitfalls on the server page. */
export default function HomePageClient() {
  return (
    <Suspense
      fallback={
        <LoadingScreen label="Starting Merlinus" sublabel="Loading warranty documentation tools…" />
      }
    >
      <BenzTechApp />
    </Suspense>
  );
}