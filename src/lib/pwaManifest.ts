import type { MetadataRoute } from 'next';
import { PWA_ICON_ENTRIES } from '@/lib/pwaIcons';

export function getPwaManifest(): MetadataRoute.Manifest {
  return {
    name: 'Merlin — Mercedes-Benz Warranty Platform',
    short_name: 'Merlin',
    description:
      'Mercedes-Benz dealership warranty story platform with audit-safe AI documentation.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#000000',
    background_color: '#000000',
    lang: 'en',
    icons: PWA_ICON_ENTRIES.map((icon) => ({
      src: icon.src,
      sizes: icon.sizes,
      type: icon.type,
      purpose: icon.purpose,
    })),
  };
}