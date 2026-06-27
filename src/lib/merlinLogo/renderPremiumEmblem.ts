import {
  MERCEDES_EMBLEM_CENTER,
  MERCEDES_RING_RADIUS,
  MERCEDES_RING_STROKE,
  MERLIN_LOGO_PALETTE,
  MERLIN_LOGO_VIEWBOX,
} from './palette';
import { MERCEDES_STAR_ARM, MERCEDES_STAR_ROTATIONS } from './paths';

const P = MERLIN_LOGO_PALETTE;
const VB = MERLIN_LOGO_VIEWBOX;
const C = MERCEDES_EMBLEM_CENTER;

function defIds(prefix: string) {
  return {
    canvas: `${prefix}-canvas`,
    ambient: `${prefix}-ambient`,
    ringMetal: `${prefix}-ring-metal`,
    starMetal: `${prefix}-star-metal`,
    starSpecular: `${prefix}-star-spec`,
    ringEmboss: `${prefix}-ring-emboss`,
    starEmboss: `${prefix}-star-emboss`,
    emblemGlow: `${prefix}-emblem-glow`,
  };
}

function starArmPaths(fill: string): string {
  return MERCEDES_STAR_ROTATIONS.map(
    (rotation) =>
      `<path fill="${fill}" d="${MERCEDES_STAR_ARM}" transform="rotate(${rotation} ${C} ${C})"/>`
  ).join('\n      ');
}

/** Premium 3D emblem markup — shared by React SVG and static PNG export. */
export function renderPremiumEmblemMarkup(idPrefix = 'mb'): string {
  const id = defIds(idPrefix);
  const armsMetal = starArmPaths(`url(#${id.starMetal})`);
  const armsSpecular = starArmPaths(`url(#${id.starSpecular})`);

  return `<defs>
    <linearGradient id="${id.canvas}" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${P.canvasTop}"/>
      <stop offset="100%" stop-color="${P.canvasBottom}"/>
    </linearGradient>
    <radialGradient id="${id.ambient}" cx="50%" cy="46%" r="52%">
      <stop offset="0%" stop-color="${P.ambientGlow}"/>
      <stop offset="72%" stop-color="rgba(220,228,236,0.04)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <linearGradient id="${id.ringMetal}" x1="14%" y1="10%" x2="86%" y2="90%">
      <stop offset="0%" stop-color="${P.ringHighlight}"/>
      <stop offset="38%" stop-color="${P.ringMid}"/>
      <stop offset="100%" stop-color="${P.ringShadow}"/>
    </linearGradient>
    <linearGradient id="${id.starMetal}" x1="32%" y1="6%" x2="68%" y2="94%">
      <stop offset="0%" stop-color="${P.starHighlight}"/>
      <stop offset="42%" stop-color="${P.starMid}"/>
      <stop offset="100%" stop-color="${P.starShadow}"/>
    </linearGradient>
    <linearGradient id="${id.starSpecular}" x1="40%" y1="0%" x2="60%" y2="38%">
      <stop offset="0%" stop-color="${P.specular}"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <filter id="${id.emblemGlow}" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="0" stdDeviation="18" flood-color="rgba(210,218,226,0.22)"/>
    </filter>
    <filter id="${id.ringEmboss}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="-2" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.2"/>
    </filter>
    <filter id="${id.starEmboss}" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>
      <feDropShadow dx="0" dy="-3" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="${VB}" height="${VB}" fill="url(#${id.canvas})"/>
  <circle cx="${C}" cy="${C}" r="430" fill="url(#${id.ambient})"/>
  <g filter="url(#${id.emblemGlow})">
    <g filter="url(#${id.ringEmboss})">
      <circle cx="${C}" cy="${C}" r="${MERCEDES_RING_RADIUS}" fill="none" stroke="url(#${id.ringMetal})" stroke-width="${MERCEDES_RING_STROKE}"/>
      <circle cx="${C}" cy="${C}" r="${MERCEDES_RING_RADIUS - 9}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
    </g>
    <g filter="url(#${id.starEmboss})">
      ${armsMetal}
      <g opacity="0.38">
        ${armsSpecular}
      </g>
    </g>
  </g>`;
}