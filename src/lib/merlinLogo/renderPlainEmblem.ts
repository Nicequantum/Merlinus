import {
  MERCEDES_EMBLEM_CENTER,
  MERCEDES_RING_RADIUS,
  MERCEDES_RING_STROKE,
  MERLIN_LOGO_VIEWBOX,
  PLAIN_EMBLEM_PALETTE,
} from './palette';
import { MERCEDES_STAR_ARM, MERCEDES_STAR_ROTATIONS } from './paths';

const P = PLAIN_EMBLEM_PALETTE;
const C = MERCEDES_EMBLEM_CENTER;

/** Official flat Mercedes-Benz star in circle — PWA / Apple touch / favicon fallback. */
export function renderPlainEmblemMarkup(): string {
  const arms = MERCEDES_STAR_ROTATIONS.map(
    (rotation) =>
      `<path fill="${P.star}" d="${MERCEDES_STAR_ARM}" transform="rotate(${rotation} ${C} ${C})"/>`
  ).join('\n  ');

  const VB = MERLIN_LOGO_VIEWBOX;

  return `<rect width="${VB}" height="${VB}" fill="${P.canvas}"/>
  <circle cx="${C}" cy="${C}" r="${MERCEDES_RING_RADIUS}" fill="none" stroke="${P.ring}" stroke-width="${MERCEDES_RING_STROKE}"/>
  ${arms}`;
}