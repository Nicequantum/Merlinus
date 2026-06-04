# Benz Tech (v2)

Professional Mercedes-Benz technician warranty story assistant. Scan ROs or manual entry → pre-populated vehicle (year/make/model/VIN/mileage) + labeled A/B/C complaints → diagnostic line pages with photo uploads (Xentry, guided tests, wiring, continuity) + AI analysis → one-click professional audit-resistant warranty story via Grok.

## Core Features (as specified)
- **Settings gear**: Encrypted xAI Grok API key (AES-GCM + PBKDF2 with user passphrase). Supports unlock flow. No plain text storage.
- **RO input**: Manual or photo scan. Greatly improved OCR (preprocess: grayscale/contrast/binarize + tuned Tesseract) reliably extracts year, make, model, VIN, mileage, customer complaints.
- **Pre-populate**: RO review page shows fully editable vehicle/customer fields + labeled (A. B. C...) editable complaints list auto-filled from scan.
- **Main diagnostic (line) page**: Shows customer/vehicle summary + all complaints reference. Supports multiple complaints. Upload photos of Xentry tests, fault codes, guided tests, wiring diagrams, continuity checks. AI (Grok) + client smart analysis.
- **Smart defaults**: Built-in Mercedes-Benz KB of common issues by model family + mileage band + standard test values (fuel pressure, adaptations, battery etc). "APPLY FOR THIS VEHICLE" seeds notes + expected measurements. Auto-suggests after photo uploads.
- **One-click GENERATE WARRANTY STORY**: Uses heavily engineered master tech prompt (3 C's explicit, battery charger always, initial + final XENTRY QT, realistic test drives in/out miles, verification drive, natural first-person, technical depth from Xentry data + suggestions, variety templates). Designed to produce detailed, consistent, audit-avoiding documentation.

## Improved from prior
- Reliable OCR via preprocessing + enhanced extractors (VIN fixes, more RO patterns, complaint section awareness).
- Editable pre-pop on RO page (was display-only).
- Client-side suggestions + standard values (not just AI black box).
- Proper encrypted key (not plain localStorage).
- Better labeling, summaries, and UX for tech workflow.

## Setup

1. `npm install`
2. `npm run dev`
3. Tap gear (top right) → enter xAI key + a passphrase → SAVE ENCRYPTED KEY. Unlock with same pass on restarts.
4. SCAN NEW RO (camera) or NEW MANUAL. Review/edit prefilled data + complaints on RO screen.
5. Open a line → add diagnostic photos → APPLY smart defaults → GENERATE WARRANTY STORY.

Get Grok key: https://console.x.ai

## Deployment
Vite + PWA. Works on Vercel/Netlify. `npm run build`

**New ultra-premium futuristic Mercedes-Benz app icon** (official 3-point star next-gen tech design) is used for PWA, favicon, apple-touch, and in-app logos.

**Note:** Requires internet for Grok calls. All processing (OCR, encryption, suggestions) client-side for privacy.
