# BenzTech — Mercedes-Benz Technician PWA

Professional, native-feeling Progressive Web App for Mercedes-Benz technicians. Built to look and behave like a premium iOS app with a dark professional theme.

## Features

- **Large "Scan Repair Order" button** — instantly opens the device camera
- **Automatic OCR** — uses Tesseract.js (loads ~15-20 MB language data once) to extract text from RO photos
- **Smart repair line extraction** — parses numbered lines, complaints, and VIN where possible
- **Clean repair line list** — tap any line to open the full detail view
- **Xentry image analysis** — upload screenshots; app runs OCR + heuristics to pull:
  - SDS / DTC codes
  - Guided Test names
  - Voltage, pressure, and measurement values
  - Component IDs (A7/3, N10/1, B6/1, etc.)
  - Wiring circuits and pin references
- **Technician notes** per line (autosaved)
- **Exact-spec warranty story generator** that strictly follows the supplied master technician prompt:
  - Always uses 3 C’s structure (Concern, Cause, Correction)
  - Always states battery charger + voltage > 12.5 V
  - Always references Xentry Quick Test + cloud review under VIN
  - Weaves in specific Guided Test names, pin numbers, measurements, and component locations from uploaded images
  - Natural first-person language with variation between lines
  - Punch times included
- **Copy button** — one tap copies the finished story ready for Xentry or warranty submission
- **Installable PWA** — Add to Home Screen on iOS/Android. Works offline after first load.

## How to Use

1. Open `index.html` in Safari (iOS) or Chrome (Android) — or serve via any static host.
2. Tap **SCAN REPAIR ORDER** and photograph the repair order.
3. Review / edit the extracted lines and vehicle info.
4. Tap any repair line → add notes, upload Xentry screenshots.
5. Tap **ANALYZE UPLOADED IMAGES** (optional but powerful).
6. Tap **GENERATE WARRANTY STORY** (or "Generate All" from the RO screen).
7. Review, regenerate if desired, then **COPY** and paste into your warranty system.

**Pro tip:** Use the "LOAD SAMPLE RO" button to instantly explore the full feature set without a real repair order.

## Installation (Home Screen)

- **iOS Safari**: Tap Share → "Add to Home Screen"
- **Android Chrome**: Menu → "Install app" or "Add to Home Screen"

After install it runs full-screen like a native app with its own icon.

## Offline Behavior

- Core UI and previously loaded ROs work completely offline.
- First-time OCR (Tesseract) and Tailwind require a network connection.
- Once Tesseract language data is cached by the browser it continues to work offline.

## Technical Notes

- Single-file SPA (index.html) + manifest + service worker.
- Camera uses the native `<input type="file" capture="environment">` for maximum compatibility.
- OCR and Xentry analysis are 100% client-side.
- All data stays in your browser (localStorage). Nothing is sent anywhere.
- The warranty story generator is deterministic JavaScript that strictly obeys the provided ruleset and produces varied natural-sounding output.

## Recommended Workflow for Real Use

1. Photograph the physical RO at the start of the job.
2. As you work, upload the important Xentry screenshots to the relevant line.
3. Generate the story immediately after the repair while details are fresh.
4. Copy the story and paste it into the warranty claim before closing the RO.

---

Built for technicians who hate writing warranty stories but need every one to pass review the first time.

**BenzTech v1.2**
