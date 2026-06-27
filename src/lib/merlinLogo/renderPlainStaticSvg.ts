import { MERLIN_LOGO_VIEWBOX } from './palette';
import { renderPlainEmblemMarkup } from './renderPlainEmblem';

const VB = MERLIN_LOGO_VIEWBOX;

/** Flat emblem SVG for PWA / Apple touch PNG rasterization. */
export function renderPlainEmblemStaticSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}">
  ${renderPlainEmblemMarkup()}
</svg>`;
}