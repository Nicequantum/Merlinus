# Benz Tech v2 - Improved Code Structure & Changes

## Project Layout (benz-v2 workspace)
- index.html (PWA meta, title updated)
- package.json (name: benz-tech, v2.1.0)
- public/logo.svg
- src/
  - App.tsx (THE core - all logic, UI, OCR, crypto, KB, prompts)
  - index.css (iOS-like dark theme, cards, buttons)
  - main.tsx
- vite.config.ts (PWA + esbuild minify)
- tailwind.config.js, tsconfigs, vercel.json
- README.md (full updated docs)

## Key Improvements Implemented

### 1. RO Scan & OCR (fixed limitations)
- New `preprocessImageForOCR(file)`: canvas grayscale, contrast stretch (1.95x), binarize threshold ~145. Scales large imgs to 1600px. Dramatically better Tesseract accuracy on paper ROs + Xentry screen photos (glare, low contrast, shadows).
- New `runOCR(blob, progressCb)`: centralized, uses PSM 6 (uniform text block) + eng. Replaces all inline Tesseract workers.
- Updated in 3 places: handleScanRO, addXentryPhotos (per line), addROXentryPhotos (RO-level QT).
- Greatly hardened `extractVehicleDetails`:
  - Early OCR cleanup (O->0, I->1, Q->0 etc for VINs).
  - Stronger year (MY, Model Year, before model tokens, context).
  - Make defaults Mercedes-Benz, detects via text + WMI (WDD/W1N etc).
  - Expanded model regex for GLE/GLS/S/E/C/EQ/AMG/Maybach/Sprinter etc + fallback.
  - Mileage: labeled "mileage in/odometer" first, then any mi/km.
- `extractComplaints`: many more patterns, section detection (Customer Complaint:), lettered A. B) C: , numbered, bullets, plain lines, global fallbacks for mangled headers. Dedup + length filters. Stops at headers like VIN/TECH.
- `extractCustomerName` added.
- `createROFromText`: better RO# regex, pre-sets line desc + first concern from complaints, sets customer name.
- Result: pre-populates year/make/model/VIN/mileage + A/B/C complaints reliably on next (RO) page.

### 2. RO Page (pre-populate + edit)
- Full editable form right after scan/manual:
  - Vehicle grid: Year, Make, Model, Mileage In, VIN (uppercased).
  - Customer name.
  - Complaints: labeled A. B. C... with live <textarea> per item, + ADD / per-item Trash2 remove. Auto-syncs first complaint to Line 1 concern.
- XENTRY SAVED DATA section updated label: "SCAN / ADD XENTRY PHOTOS (QT, CODES, GUIDED, WIRING...)"
- Repair lines list improved with concern preview.
- All updates call saveRO (persists to IDB + in-memory list).

### 3. Main Diagnostic / Line Page
- Top summary bar: vehicle + mileage + short VIN + customer + "Complaints: A. xxx B. yyy".
- Line description editable.
- Customer Concern (prefilled) + Technician Notes.
- DIAGNOSTIC EVIDENCE PHOTOS: button text now explicitly "ADD XENTRY TESTS / FAULT CODES / GUIDED / WIRING / CONTINUITY". Supports multiple.
- Thumbnails + extracted summary (codes/guided/meas).
- After upload: auto-calls applySmartDefaultsToLine if notes empty.
- **One-click prominent**: "GENERATE WARRANTY STORY (ONE-CLICK)" (disabled until key).
- Story card shows "WARRANTY STORY — 3 C's • AUDIT-RESISTANT".

### 4. Smart Defaults for Tests + Common Issues (new)
- `MERCEDES_KB` const: per family (GLE incl GLS/GLC, S/Maybach, E/CLS, C/CLA, default).
  - mileageBands: 0-30k / 30-75k / 75k+ etc.
  - commonIssues[] e.g. "High pressure fuel injectors (lean codes P0171/P0174)", "ABC or Airmatic...", "Timing chain stretch".
  - standardTests[]: {label, spec, note?} e.g. "Fuel rail pressure idle": "200-250 bar", "Leak-off rate (injectors)": "< 2 ml / 30s per cyl per XENTRY", "Battery voltage (resting)": "12.6-12.8 V (Charger connected during diag)".
- `getSuggestions(ro)`: picks family + best mileage band for current VIN/model/miles. Returns issues + tests + bandNote.
- `applySmartDefaultsToLine(lineId)`: appends "[Smart defaults for GLE • 48250 mi band]\nCommon issues... \nStandard values: ..." to technicianNotes. Seeds extracted.measurements with specs if empty.
- UI: always-visible "SMART DEFAULTS & COMMON ISSUES" card on line page + "APPLY FOR THIS VEHICLE" button. Shows preview of top issues/tests.
- Integrated into prompt context (userMessage already sends extracted + raw OCR; now notes have the values too).

### 5. Settings: Encrypted X (xAI) API Key Selection
- Full Web Crypto impl:
  - `deriveKey(pass, salt)`: PBKDF2 150k iter SHA-256 -> AES-GCM 256.
  - `encryptApiKey(plain, pass)` -> JSON {v,salt,iv,ct} btoa.
  - `decryptApiKey`, `saveEncryptedKey`, `loadEncryptedKey`.
- State: apiKey (mem only), passphrase (temp), hasEncryptedKey, isUnlocked.
- Storage: 'benztech_grok_key_enc_v1' (cipher) or legacy plain (migrates on save).
- Settings UI:
  - If enc + locked: shows "Unlock with passphrase" panel.
  - Key input (xai-...).
  - Passphrase input (for encrypt).
  - SAVE ENCRYPTED KEY (calls encrypt + stores).
  - CLEAR ALL.
  - Status: "✓ Key unlocked in memory for this session."
- generateStory: if locked+hasEnc -> direct to settings unlock prompt.
- Never persists plain key when passphrase used.

### 6. Prompt & Story Enhancements
- SYSTEM_PROMPT + MANDATORY: reinforced 3 C's with "Reference the specific labeled complaints (A, B, C...)", "standard test values and common issues ... when they align with data", "Incorporate any provided smart defaults".
- User message already sends complaints (A/B/C), ro-level + line OCR, extracted, history.
- Still 12 templates + random + historyContext for style.
- "Write only the warranty story... Make it sound completely human."

### 7. Other / Polish
- Icons: added Trash2, Edit2 (used for complaints).
- Branding: Benz Tech, Mercedes-Benz Technician • Warranty Story Assistant everywhere (home, header, manifest, title, README). Kept Maybach in KB/prompt (valid).
- Home: updated scan hint text.
- Persistence: IDB + state sync via latestRO pattern (avoids stale).
- PWA: kept, manifest updated.
- Build: tsc --noEmit clean, vite produces dist/ (minor post-emit plugin warning pre-existing from terser dep in pwa stack; app bundle fine).
- No backend changes needed (still pure client + direct x.ai Grok).

## Data Flow (improved)
1. Home: SCAN (preprocess+OCR -> createROFromText -> extract* -> save) or MANUAL.
2. RO view: editable vehicle/customer + A/B/C complaints (live update), RO-level Xentry scan (feeds line0 + ro), list of lines.
3. Line view: summary header (vehicle+complaints), editable concern/notes, evidence uploads (per-line preprocess+OCR+parse+merge+auto-smart-seed), APPLY defaults, GENERATE (sends everything incl suggestions in notes), copy/regenerate story.
4. All persisted.

## How to Use (post changes)
- npm run dev
- Gear -> paste xai- key + passphrase -> SAVE ENCRYPTED.
- SCAN NEW RO (real shop photo works far better now) or NEW MANUAL.
- On RO: confirm/fix year/make/model/VIN/miles/customer + edit/add A. B. complaints.
- Optionally SCAN XENTRY on RO (Quick Test etc).
- Tap line -> add diagnostic photos (Xentry/Guided/Wiring/Cont etc) -> APPLY FOR THIS VEHICLE (or auto) -> GENERATE.
- Story covers 3C's, charger, QT in/out, drives, standards, sounds pro.

This fulfills all requested core features + fixes scan limitations + adds smart test defaults.

See src/App.tsx for full implementation (~1350 LOC, focused).