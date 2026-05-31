# BenzTech — Mercedes-Benz Technician PWA

Professional, native-feeling Progressive Web App for Mercedes-Benz technicians. Built with **Vite + React** and designed to feel like a premium iOS app (dark professional theme).

## Tech Stack

- Vite 6 + React 18
- Tailwind CSS 3
- Tesseract.js (client-side OCR)
- vite-plugin-pwa (automatic service worker + manifest)
- Fully offline capable after first load

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Deployment to Vercel

This project is pre-configured for Vercel:

1. Push to GitHub
2. Import the repo in Vercel
3. Vercel auto-detects Vite → deploys correctly
4. `vercel.json` handles SPA routing + PWA headers

## Key Features

- Large **Scan Repair Order** button (opens camera)
- Automatic OCR using Tesseract.js
- Clean repair line list
- Per-line detail view with:
  - Editable technician notes
  - Multiple Xentry image uploads + automatic analysis (DTCs, Guided Tests, measurements, component locations, wiring/pins)
- **Exact-spec warranty story generator** following the 18-year master technician prompt (3 C’s, battery charger statement, Xentry cloud reference, natural first-person language with variation)
- One-tap copy + regenerate
- Proper PWA (installable on iOS/Android home screen, works offline)

## Project Structure

```
src/
├── App.jsx          # Main application (all core logic)
├── main.jsx
└── index.css        # Tailwind + custom iOS styling

public/              # Static assets (add your icons here)
vercel.json          # Vercel + SPA + PWA config
```

## Adding PWA Icons

For best results, add these files to the `public` folder:

- `pwa-192x192.png`
- `pwa-512x512.png`

You can generate them from the star logo in the app or use any Mercedes-Benz style icon.

---

Built for technicians who need fast, reliable, review-proof warranty stories.
