'use client';

import { useId } from 'react';
import { MERLIN_LOGO_VIEWBOX } from '@/lib/merlinLogo/palette';
import { renderPremiumEmblemMarkup } from '@/lib/merlinLogo/renderPremiumEmblem';

interface MercedesStarMarkProps {
  className?: string;
  /** Accessible label — omit when decorative (parent has text). */
  title?: string;
  /** Subtle pulsing glow — use on splash / loading surfaces. */
  animated?: boolean;
}

/** Premium Mercedes-Benz emblem — 3D metallic star in circle (official geometry). */
export function MercedesStarMark({ className, title, animated = false }: MercedesStarMarkProps) {
  const uid = useId().replace(/:/g, '');
  const labelled = Boolean(title);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MERLIN_LOGO_VIEWBOX} ${MERLIN_LOGO_VIEWBOX}`}
      className={[className, animated ? 'merlin-logo-animated' : ''].filter(Boolean).join(' ') || undefined}
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g dangerouslySetInnerHTML={{ __html: renderPremiumEmblemMarkup(`mb-${uid}`) }} />
    </svg>
  );
}