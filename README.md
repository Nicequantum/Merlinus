# BenzTech

Clean, professional Mercedes-Benz technician tool for generating warranty stories using Grok AI.

## Features
- Scan repair orders (camera + OCR with Tesseract.js)
- Manage repair lines
- Dedicated Settings screen for Grok API key
- Real Grok API calls using the official senior master technician system prompt
- Clean dark professional UI (PWA-ready)

## Setup

1. `npm install`
2. `npm run dev`
3. Go to Settings and paste your Grok API key from https://console.x.ai
4. Start scanning repair orders and generating real AI warranty stories.

## Deployment
Works great on Vercel. Push to GitHub and import the repo.

**Important:** Story generation requires internet + a valid Grok API key.
