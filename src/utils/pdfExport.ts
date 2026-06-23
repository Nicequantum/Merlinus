import { jsPDF } from 'jspdf';
import type { RepairLine, RepairOrder } from '@/types';

const STORY_LINE_HEIGHT = 1.25;
const STORY_PARAGRAPH_GAP = 8;

/** Normalize warranty story text for CDK/DMS paste — plain paragraphs, no junk whitespace. */
export function normalizeWarrantyStoryText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function copyPlainTextToClipboard(text: string): Promise<void> {
  const plain = normalizeWarrantyStoryText(text);
  if (!plain) {
    throw new Error('Nothing to copy');
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.write) {
    try {
      const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return;
    } catch {
      // fall through to writeText / execCommand
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plain);
      return;
    } catch {
      // fall through
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = plain;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '2em';
  textarea.style.height = '2em';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, plain.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('Copy command failed');
  }
}

function renderPdfLines(
  doc: jsPDF,
  text: string,
  margin: number,
  maxWidth: number,
  startY: number,
  fontSize: number,
  style: 'normal' | 'bold' = 'normal'
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = fontSize * STORY_LINE_HEIGHT;
  let y = startY;

  doc.setFont('helvetica', style);
  doc.setFontSize(fontSize);

  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (let i = 0; i < lines.length; i++) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines[i], margin, y);
    y += lineHeight;
  }

  return y;
}

function renderStoryParagraphs(
  doc: jsPDF,
  text: string,
  margin: number,
  maxWidth: number,
  startY: number,
  fontSize: number
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = fontSize * STORY_LINE_HEIGHT;
  let y = startY;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  const paragraphs = text.split(/\n\n+/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);

  for (let p = 0; p < paragraphs.length; p++) {
    if (p > 0) y += STORY_PARAGRAPH_GAP;

    const wrapped = doc.splitTextToSize(paragraphs[p], maxWidth) as string[];
    let offset = 0;

    while (offset < wrapped.length) {
      const room = Math.max(1, Math.floor((pageHeight - margin - y) / lineHeight));
      const chunk = wrapped.slice(offset, offset + room);

      if (chunk.length === 0) {
        doc.addPage();
        y = margin;
        continue;
      }

      doc.text(chunk, margin, y, { lineHeightFactor: STORY_LINE_HEIGHT });
      y += chunk.length * lineHeight;
      offset += chunk.length;

      if (offset < wrapped.length) {
        doc.addPage();
        y = margin;
      }
    }
  }

  return y;
}

export function exportWarrantyStoryPdf(ro: RepairOrder, line: RepairLine, storyOverride?: string): void {
  const story = normalizeWarrantyStoryText(storyOverride ?? line.warrantyStory ?? '');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;

  let y = margin;
  y = renderPdfLines(doc, 'Merlin — Warranty Story', margin, maxWidth, y, 14, 'bold');
  y += 8;

  const vehicle = [ro.vehicle.year, ro.vehicle.make, ro.vehicle.model].filter(Boolean).join(' ');
  const meta = [
    `RO: ${ro.roNumber}`,
    `Vehicle: ${vehicle}`,
    ro.vehicle.vin ? `VIN: ${ro.vehicle.vin}` : '',
    ro.vehicle.engine ? `Engine: ${ro.vehicle.engine}` : '',
    ro.vehicle.mileageIn ? `Mileage In: ${ro.vehicle.mileageIn}` : '',
    `Line ${line.lineNumber}: ${line.description}`,
  ]
    .filter(Boolean)
    .join('\n');

  y = renderPdfLines(doc, meta, margin, maxWidth, y, 10);
  y += 10;
  y = renderPdfLines(doc, 'WARRANTY STORY', margin, maxWidth, y, 11, 'bold');
  y += 6;
  y = renderStoryParagraphs(doc, story, margin, maxWidth, y, 10);
  y += 12;
  renderPdfLines(doc, `Generated: ${new Date().toLocaleString()}`, margin, maxWidth, y, 8);

  doc.save(`warranty-story-${ro.roNumber}-line${line.lineNumber}.pdf`);
}

export async function copyFormattedStory(
  _ro: RepairOrder,
  line: RepairLine,
  storyOverride?: string
): Promise<void> {
  const storyEl = typeof document !== 'undefined' ? document.getElementById(`warranty-story-${line.id}`) : null;
  const raw =
    storyOverride ??
    (storyEl instanceof HTMLTextAreaElement ? storyEl.value : undefined) ??
    line.warrantyStory ??
    '';
  await copyPlainTextToClipboard(raw);
}