import { MERLIN_LOGO_VIEWBOX } from './palette';
import { renderPremiumEmblemMarkup } from './renderPremiumEmblem';

const VB = MERLIN_LOGO_VIEWBOX;

/** Full app-icon SVG for PNG rasterization (fixed ids — not for inline DOM duplication). */
export function renderMerlinLogoStaticSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}">
  ${renderPremiumEmblemMarkup('mb')}
</svg>`;
}