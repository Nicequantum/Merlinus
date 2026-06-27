import { MERLIN_LOGO_CORNER_RADIUS, MERLIN_LOGO_PALETTE, MERLIN_LOGO_VIEWBOX } from './palette';
import {
  MERLIN_BUBBLE_AO_ARC,
  MERLIN_BUBBLE_HIGHLIGHT_ARC,
  MERLIN_STAR_EDGE_LEFT,
  MERLIN_STAR_EDGE_RIGHT,
  MERLIN_STAR_INNER,
  MERLIN_STAR_OUTER,
  MERLIN_STAR_SHINE,
} from './paths';

const P = MERLIN_LOGO_PALETTE;
const VB = MERLIN_LOGO_VIEWBOX;
const RX = MERLIN_LOGO_CORNER_RADIUS;

/** Full app-icon SVG for PNG rasterization (fixed ids — not for inline DOM duplication). */
export function renderMerlinLogoStaticSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}">
  <defs>
    <linearGradient id="merlin-bg" x1="8%" y1="0%" x2="92%" y2="100%">
      <stop offset="0%" stop-color="${P.canvasTop}"/>
      <stop offset="55%" stop-color="${P.canvasMid}"/>
      <stop offset="100%" stop-color="${P.canvasBottom}"/>
    </linearGradient>
    <radialGradient id="merlin-vignette" cx="50%" cy="44%" r="72%">
      <stop offset="0%" stop-color="${P.accent}" stop-opacity="0.26"/>
      <stop offset="45%" stop-color="${P.accent}" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="merlin-halo" cx="50%" cy="50%" r="50%">
      <stop offset="72%" stop-color="${P.accent}" stop-opacity="0"/>
      <stop offset="88%" stop-color="${P.accent}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${P.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="merlin-rim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${P.accentBright}"/>
      <stop offset="22%" stop-color="${P.accent}"/>
      <stop offset="78%" stop-color="#0077a8"/>
      <stop offset="100%" stop-color="${P.accentDeep}"/>
    </linearGradient>
    <radialGradient id="merlin-glass" cx="38%" cy="28%" r="78%">
      <stop offset="0%" stop-color="${P.glassTop}"/>
      <stop offset="55%" stop-color="${P.glassMid}"/>
      <stop offset="100%" stop-color="${P.glassBottom}"/>
    </radialGradient>
    <linearGradient id="merlin-chrome" x1="28%" y1="12%" x2="72%" y2="92%">
      <stop offset="0%" stop-color="${P.chromeHighlight}"/>
      <stop offset="18%" stop-color="#f0f4fa"/>
      <stop offset="42%" stop-color="${P.chromeMid}"/>
      <stop offset="68%" stop-color="#8f9aad"/>
      <stop offset="100%" stop-color="${P.chromeShadow}"/>
    </linearGradient>
    <linearGradient id="merlin-chrome-shine" x1="20%" y1="0%" x2="55%" y2="45%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="merlin-ring" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6a7585" stop-opacity="0.25"/>
      <stop offset="50%" stop-color="#eef2f8" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#6a7585" stop-opacity="0.25"/>
    </linearGradient>
    <filter id="merlin-bubble-shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.65"/>
      <feDropShadow dx="0" dy="-4" stdDeviation="8" flood-color="${P.accent}" flood-opacity="0.32"/>
    </filter>
    <filter id="merlin-star-depth" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#000000" flood-opacity="0.5"/>
      <feDropShadow dx="0" dy="-3" stdDeviation="5" flood-color="#ffffff" flood-opacity="0.2"/>
    </filter>
  </defs>

  <rect width="${VB}" height="${VB}" rx="${RX}" fill="url(#merlin-bg)"/>
  <rect width="${VB}" height="${VB}" rx="${RX}" fill="url(#merlin-vignette)"/>
  <circle cx="512" cy="512" r="420" fill="url(#merlin-halo)"/>

  <g filter="url(#merlin-bubble-shadow)">
    <circle cx="512" cy="512" r="400" fill="none" stroke="url(#merlin-rim)" stroke-width="26"/>
    <circle cx="512" cy="512" r="386" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
    <circle cx="512" cy="512" r="372" fill="url(#merlin-glass)" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
    <ellipse cx="430" cy="390" rx="210" ry="120" fill="rgba(255,255,255,0.1)"/>
    <path d="${MERLIN_BUBBLE_HIGHLIGHT_ARC}" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="20" stroke-linecap="round"/>
    <path d="${MERLIN_BUBBLE_AO_ARC}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="16" stroke-linecap="round"/>
  </g>

  <circle cx="512" cy="512" r="292" fill="none" stroke="url(#merlin-ring)" stroke-width="9"/>
  <circle cx="512" cy="512" r="292" fill="none" stroke="rgba(0,173,239,0.2)" stroke-width="3"/>

  <g filter="url(#merlin-star-depth)">
    <path fill="url(#merlin-chrome)" d="${MERLIN_STAR_OUTER}"/>
    <path fill="${P.starCutout}" opacity="0.9" d="${MERLIN_STAR_INNER}"/>
    <path fill="url(#merlin-chrome-shine)" d="${MERLIN_STAR_SHINE}" opacity="0.58"/>
    <path fill="rgba(255,255,255,0.12)" d="${MERLIN_STAR_EDGE_LEFT}"/>
    <path fill="rgba(255,255,255,0.08)" d="${MERLIN_STAR_EDGE_RIGHT}"/>
  </g>
</svg>`;
}