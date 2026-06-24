# Merlin — Mercedes-Benz Warranty Story Generator

**Secure AI-Powered Warranty Documentation Platform for Mercedes-Benz Dealerships**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Security](https://img.shields.io/badge/Security-Enterprise_Grade-22c55e?style=for-the-badge)](https://github.com/Nicequantum/viti-ai-clone)

Merlin is a secure, dealership-specific platform that allows Mercedes-Benz technicians to create accurate, professional warranty narratives using Grok AI. It combines voice input, enterprise-grade security, and a complete audit trail to meet the standards of both individual dealerships and multi-location groups.

---

## Who This Is For

| Role | Primary Benefit |
|------|-----------------|
| **Technicians** | Fast voice input and professional story generation |
| **Service Managers** | Full visibility and audit oversight |
| **Fixed Ops Directors & Groups** | Secure, compliant, and scalable warranty system |

---

## Key Features

- Voice-first input designed for busy service bays
- Grok AI for high-quality, policy-aligned warranty stories
- AES-256-GCM encryption of sensitive data at rest
- Immutable SHA-256 hash-chained audit trail
- Professional branded PDF generation
- Client-side image compression with private blob storage
- Role-based access control with instant session revocation
- Stable UI built for tablet and desktop use in dealerships

---

## Architecture Overview

```mermaid
flowchart LR
    subgraph Client["Technician Device"]
        A[Voice + Form Capture]
        B[OCR + Image Compression]
        A --> B
    end

    subgraph Platform["Merlin — Next.js 15 API"]
        C[JWT Auth + Session Revocation]
        D[AES-256-GCM Encryption]
        E[Grok AI Generation]
        F[Hash-Chained Audit Log]
        C --> D --> E --> F
    end

    subgraph External["External Services"]
        G[(PostgreSQL)]
        H[Vercel Blob]
        I[xAI Grok API]
    end

    B -->|HTTPS| C
    D --> G
    E --> I
    C --> H
    E --> J[Branded PDF]
```

**Design principles:** API keys never leave the server; sensitive fields are encrypted before database write; every AI generation and export is audit-logged; sessions revoke instantly on password change or deactivation.

---

## How It Works

1. Technician logs in and opens a repair order
2. Captures symptoms and repair details using voice or form
3. Data is transmitted over HTTPS; sensitive fields are encrypted server-side before storage
4. Grok AI generates a professional warranty narrative from a sanitized prompt
5. All actions are recorded in a tamper-evident audit log
6. Technician reviews and exports a branded PDF ready for submission

---

## Security & Compliance

| Control | Implementation |
|---------|----------------|
| **Encryption at rest** | AES-256-GCM on customer name, VIN, complaints, technician notes, OCR text, diagnostic data, and warranty stories |
| **Audit integrity** | Append-only SHA-256 hash chain per dealership |
| **Session security** | JWT with server-side revocation on password change, deactivation, or logout |
| **Image access** | Private Vercel Blob storage; session-gated `/api/images` proxy |
| **AI safety** | Prompts use `[NOT DOCUMENTED]` / `[NOT PROVIDED]` — no fabricated test data |
| **Rate limiting** | Distributed via Vercel KV in production |

> **Production requirement:** A signed Data Processing Agreement with xAI is required before processing real customer or vehicle data.

---

## Voice Input (Shop-Floor Tablets)

Merlin uses the browser **Web Speech API** for hands-free warranty story entry on rugged tablets in noisy service bays. Voice is optional — **manual typing is always available** on every field.

### How technicians use it

| Mode | Action |
|------|--------|
| **Tap to toggle** (default) | Tap the mic once to start, tap again to stop |
| **Push-to-talk** | Tap the hand/toggle button to switch modes, then **hold** the mic while speaking |

While listening, a panel shows **bay noise level**, **recognition confidence** (when Chrome exposes it), and a live preview that distinguishes **final** vs *interim* text.

### Noise robustness

- A parallel microphone stream requests **auto gain control**, **noise suppression**, and **echo cancellation** where the browser supports them
- **Adaptive confidence threshold** lowers as background noise rises so usable dictation is not rejected on loud shop floors
- **Auto-restart** recovers from brief silence, network blips, and recognizer `onend` events (capped to prevent runaway loops)
- **Listening timeout** (15s default) ends a stuck session with a one-tap **Retry** button

### Browser requirements

| Requirement | Detail |
|-------------|--------|
| **Browser** | Chrome or Edge (Chromium Web Speech API) |
| **Microphone** | Allow mic permission for the dealership site |
| **Network** | Cloud speech recognition requires connectivity |
| **Fallback** | Unsupported browsers show “Voice unavailable — type below.” |

### Dealership configuration

Edit `DEFAULT_VOICE_INPUT_SETTINGS` in `src/lib/voice/voiceSettings.ts` (re-exported as `VOICE_INPUT_SETTINGS` from `src/lib/constants.ts`):

- `listeningTimeoutMs`, `maxAutoRestarts`, `silenceRestartDelayMs`
- `baseConfidenceThreshold` / `minConfidenceThreshold` / `noiseAdjustmentFactor`
- `pushToTalkDefault`, `enabled` (master switch)
- Audio constraints: `autoGainControl`, `noiseSuppression`, `echoCancellation`

### Architecture

```
StableTextarea / StableInput
        └── VoiceInputButton (UI + animations)
                └── useVoiceInput (React hook)
                        └── VoiceInputService (src/lib/voice/)
                                ├── Web Speech API (continuous + interim)
                                ├── NoiseMonitor (Web Audio RMS)
                                └── Adaptive confidence + error recovery
```

---

## Common Failure Modes & Troubleshooting

| Issue | Symptom | Recommended Fix |
|-------|---------|-----------------|
| **Grok Timeout** | Long loading or timeout error | Shorten input and click **Regenerate** |
| **Voice Input Not Working** | Mic button does nothing or stops mid-sentence | Allow mic in Chrome/Edge; switch to push-to-talk; check bay Wi‑Fi; use **Retry** or type manually |
| **PDF Generation Failed** | "Failed to generate PDF" | Complete all required fields first, then regenerate |
| **Frequent Logouts** | Unexpected session expiry | Verify device clock; clear browser cache |
| **Audit Chain Warning** | Integrity error in audit log | Stop use; notify Service Manager and IT immediately |

---

## Deployment

### Local development

```bash
git clone https://github.com/Nicequantum/viti-ai-clone.git
cd viti-ai-clone
npm install
cp .env.example .env.local
npm run db:migrate:deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after configuring environment variables.

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session signing key (`openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key — 64 hex chars (`openssl rand -hex 32`) |
| `GROK_API_KEY` | For AI | xAI API key (server-side only) |
| `BLOB_READ_WRITE_TOKEN` | For uploads | Private diagnostic image storage |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Production | Distributed rate limiting |
| `ADMIN_SEED_PASSWORD` | For seed | Initial manager password — never commit |

### Production (Vercel + PostgreSQL)

1. Connect repo, deploy branch `main`
2. Set all variables from `.env.example`
3. Run `npm run db:migrate:deploy` (included in `npm run build`)
4. Run `npm run db:reencrypt` if upgrading an existing database
5. Verify `GET /api/health` returns `"status": "ok"`

### Pre-production checklist

- [ ] Environment variables configured on host
- [ ] Database migrations applied without errors
- [ ] Legacy data re-encrypted (`npm run db:reencrypt`) if upgrading
- [ ] Seed/default passwords rotated via Settings
- [ ] Audit log hash-chain integrity shows **VALID**
- [ ] xAI DPA executed
- [ ] CI passing on `main`

---

**Repository:** [github.com/Nicequantum/viti-ai-clone](https://github.com/Nicequantum/viti-ai-clone)

Built for Mercedes-Benz dealerships that demand both speed and full accountability.

**License:** Proprietary — authorized Mercedes-Benz dealership use only.