'use client';

import { useId } from 'react';

interface MercedesStarMarkProps {
  className?: string;
  /** Accessible label — omit when decorative (parent has text). */
  title?: string;
}

/** Canonical Mercedes-inspired three-pointed star — matches PWA / apple-touch PNGs. */
export function MercedesStarMark({ className, title }: MercedesStarMarkProps) {
  const uid = useId().replace(/:/g, '');
  const labelled = Boolean(title);

  const ids = {
    bg: `merlin-bg-${uid}`,
    vignette: `merlin-vignette-${uid}`,
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
      viewBox="0 0 1024 1024"
      className={className}
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={ids.bg} x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#181820" />
          <stop offset="55%" stopColor="#0c0c10" />
          <stop offset="100%" stopColor="#050508" />
        </linearGradient>
        <radialGradient id={ids.vignette} cx="50%" cy="44%" r="72%">
          <stop offset="0%" stopColor="#00adef" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#00adef" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.rim} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9ee9ff" />
          <stop offset="22%" stopColor="#00adef" />
          <stop offset="78%" stopColor="#0077a8" />
          <stop offset="100%" stopColor="#003d5c" />
        </linearGradient>
        <radialGradient id={ids.glass} cx="38%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#2a2a38" />
          <stop offset="55%" stopColor="#12121a" />
          <stop offset="100%" stopColor="#06060a" />
        </radialGradient>
        <linearGradient id={ids.chrome} x1="28%" y1="12%" x2="72%" y2="92%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="18%" stopColor="#f0f4fa" />
          <stop offset="42%" stopColor="#c5ced9" />
          <stop offset="68%" stopColor="#8f9aad" />
          <stop offset="100%" stopColor="#5c6675" />
        </linearGradient>
        <linearGradient id={ids.chromeShine} x1="20%" y1="0%" x2="55%" y2="45%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.ring} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6a7585" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#eef2f8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#6a7585" stopOpacity="0.25" />
        </linearGradient>
        <filter id={ids.bubbleShadow} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000000" floodOpacity="0.65" />
          <feDropShadow dx="0" dy="-4" stdDeviation="8" floodColor="#00adef" floodOpacity="0.28" />
        </filter>
        <filter id={ids.starDepth} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000000" floodOpacity="0.5" />
          <feDropShadow dx="0" dy="-3" stdDeviation="5" floodColor="#ffffff" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect width="1024" height="1024" rx="230" fill={`url(#${ids.bg})`} />
      <rect width="1024" height="1024" rx="230" fill={`url(#${ids.vignette})`} />

      <g filter={`url(#${ids.bubbleShadow})`}>
        <circle cx="512" cy="512" r="400" fill="none" stroke={`url(#${ids.rim})`} strokeWidth="26" />
        <circle
          cx="512"
          cy="512"
          r="372"
          fill={`url(#${ids.glass})`}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="3"
        />
        <ellipse cx="430" cy="390" rx="210" ry="120" fill="rgba(255,255,255,0.09)" />
        <path
          d="M 268 410 A 250 250 0 0 1 756 410"
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="20"
          strokeLinecap="round"
        />
      </g>

      <circle cx="512" cy="512" r="292" fill="none" stroke={`url(#${ids.ring})`} strokeWidth="9" />
      <circle cx="512" cy="512" r="292" fill="none" stroke="rgba(0,173,239,0.18)" strokeWidth="3" />

      <g filter={`url(#${ids.starDepth})`}>
        <path
          fill={`url(#${ids.chrome})`}
          d="M 512 314 L 657.5 428 L 683.4 611 L 512 680 L 340.6 611 L 366.5 428 Z"
        />
        <path
          fill="#07070b"
          opacity="0.9"
          d="M 512 378 L 612 462 L 628 578 L 512 622 L 396 578 L 412 462 Z"
        />
        <path
          fill={`url(#${ids.chromeShine})`}
          d="M 512 314 L 580 395 L 512 420 L 444 395 Z"
          opacity="0.55"
        />
      </g>
    </svg>
  );
}