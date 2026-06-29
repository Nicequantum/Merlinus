'use client';

import { BenzTechApp } from '@/components/BenzTechApp';

/** Client entry for / — avoids next/dynamic + ssr:false pitfalls on the server page. */
export default function HomePageClient() {
  return <BenzTechApp />;
}