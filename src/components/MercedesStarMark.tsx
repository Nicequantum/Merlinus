'use client';

import { useId } from 'react';
import { MERLIN_LOGO_CORNER_RADIUS, MERLIN_LOGO_PALETTE, MERLIN_LOGO_VIEWBOX } from '@/lib/merlinLogo/palette';
import {
  MERLIN_BUBBLE_AO_ARC,
  MERLIN_BUBBLE_HIGHLIGHT_ARC,
  MERLIN_STAR_EDGE_LEFT,
  MERLIN_STAR_EDGE_RIGHT,
  MERLIN_STAR_INNER,
  MERLIN_STAR_OUTER,
  MERLIN_STAR_SHINE,
} from '@/lib/merlinLogo/paths';

interface MercedesStarMarkProps {
  className?: string;
  /** Accessible label — omit when decorative (parent has text). */
  title?: string;
  /** Subtle pulsing glow — use on splash / loading surfaces. */
  animated?: boolean;
}

const P = MERLIN_LOGO_PALETTE;

/** Canonical Mercedes-inspired three-pointed star — matches PWA / apple-touch PNGs. */
export function MercedesStarMark({ className, title, animated = false }: MercedesStarMarkProps) {
  const uid = useId().replace(/:/g, '');
  const labelled = Boolean(title);

  const ids = {
    bg: `merlin-bg-${uid}`,
    vignette: `merlin-vignette-${uid}`,
    halo: `merlin-halo-${uid}`,
    rim: `merlin-rim-${uid}`,
    glass: `merlin-glass-${uid}`,
    chrome: `merlin-chrome-${uid}`,
    chromeShine: `merlin-chrome-shine-${uid}`,
    ring: `merlin-ring-${uid}`,
    bubbleShadow: `merlin-bubble-shadow-${uid}`,
    starDepth: `merlin-star-depth-${uid}`,
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MERLIN_LOGO_VIEWBOX} ${MERLIN_LOGO_VIEWBOX}`}
      className={[className, animated ? 'merlin-logo-animated' : ''].filter(Boolean).join(' ') || undefined}
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={ids.bg} x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor={P.canvasTop} />
          <stop offset="55%" stopColor={P.canvasMid} />
          <stop offset="100%" stopColor={P.canvasBottom} />
        </linearGradient>
        <radialGradient id={ids.vignette} cx="50%" cy="44%" r="72%">
          <stop offset="0%" stopColor={P.accent} stopOpacity="0.26" />
          <stop offset="45%" stopColor={P.accent} stopOpacity="0.07" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.halo} cx="50%" cy="50%" r="50%">
          <stop offset="72%" stopColor={P.accent} stopOpacity="0" />
          <stop offset="88%" stopColor={P.accent} stopOpacity="0.14" />
          <stop offset="100%" stopColor={P.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.rim} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={P.accentBright} />
          <stop offset="22%" stopColor={P.accent} />
          <stop offset="78%" stopColor="#0077a8" />
          <stop offset="100%" stopColor={P.accentDeep} />
        </linearGradient>
        <radialGradient id={ids.glass} cx="38%" cy="28%" r="78%">
          <stop offset="0%" stopColor={P.glassTop} />
          <stop offset="55%" stopColor={P.glassMid} />
          <stop offset="100%" stopColor={P.glassBottom} />
        </radialGradient>
        <linearGradient id={ids.chrome} x1="28%" y1="12%" x2="72%" y2="92%">
          <stop offset="0%" stopColor={P.chromeHighlight} />
          <stop offset="18%" stopColor="#f0f4fa" />
          <stop offset="42%" stopColor={P.chromeMid} />
          <stop offset="68%" stopColor="#8f9aad" />
          <stop offset="100%" stopColor={P.chromeShadow} />
        </linearGradient>
        <linearGradient id={ids.chromeShine} x1="20%" y1="0%" x2="55%" y2="45%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.ring} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6a7585" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#eef2f8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#6a7585" stopOpacity="0.25" />
        </linearGradient>
        <filter id={ids.bubbleShadow} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000000" floodOpacity="0.65" />
          <feDropShadow dx="0" dy="-4" stdDeviation="8" floodColor={P.accent} floodOpacity="0.32" />
        </filter>
        <filter id={ids.starDepth} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000000" floodOpacity="0.5" />
          <feDropShadow dx="0" dy="-3" stdDeviation="5" floodColor="#ffffff" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect
        width={MERLIN_LOGO_VIEWBOX}
        height={MERLIN_LOGO_VIEWBOX}
        rx={MERLIN_LOGO_CORNER_RADIUS}
        fill={`url(#${ids.bg})`}
      />
      <rect
        width={MERLIN_LOGO_VIEWBOX}
        height={MERLIN_LOGO_VIEWBOX}
        rx={MERLIN_LOGO_CORNER_RADIUS}
        fill={`url(#${ids.vignette})`}
      />
      <circle cx="512" cy="512" r="420" fill={`url(#${ids.halo})`} />

      <g filter={`url(#${ids.bubbleShadow})`}>
        <circle cx="512" cy="512" r="400" fill="none" stroke={`url(#${ids.rim})`} strokeWidth="26" />
        <circle cx="512" cy="512" r="386" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="512"
          cy="512"
          r="372"
          fill={`url(#${ids.glass})`}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3"
        />
        <ellipse cx="430" cy="390" rx="210" ry="120" fill="rgba(255,255,255,0.1)" />
        <path
          d={MERLIN_BUBBLE_HIGHLIGHT_ARC}
          fill="none"
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="20"
          strokeLinecap="round"
        />
        <path
          d={MERLIN_BUBBLE_AO_ARC}
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>

      <circle cx="512" cy="512" r="292" fill="none" stroke={`url(#${ids.ring})`} strokeWidth="9" />
      <circle cx="512" cy="512" r="292" fill="none" stroke="rgba(0,173,239,0.2)" strokeWidth="3" />

      <g filter={`url(#${ids.starDepth})`}>
        <path fill={`url(#${ids.chrome})`} d={MERLIN_STAR_OUTER} />
        <path fill={P.starCutout} opacity="0.9" d={MERLIN_STAR_INNER} />
        <path fill={`url(#${ids.chromeShine})`} d={MERLIN_STAR_SHINE} opacity="0.58" />
        <path fill="rgba(255,255,255,0.12)" d={MERLIN_STAR_EDGE_LEFT} />
        <path fill="rgba(255,255,255,0.08)" d={MERLIN_STAR_EDGE_RIGHT} />
      </g>
    </svg>
  );
}