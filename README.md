# Benz Tech — Mercedes-Benz Warranty Story Generator

**Secure AI-Powered Warranty Documentation Platform for Mercedes-Benz Dealerships**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Security](https://img.shields.io/badge/Security-Enterprise_Grade-22c55e?style=for-the-badge)](https://github.com/Nicequantum/viti-ai-clone)

A secure, purpose-built platform that enables Mercedes-Benz service technicians to generate accurate, professional warranty narratives using Grok AI, while maintaining full audit integrity and compliance controls.

---

## Who This Is For

| Role | Key Benefits |
|------|--------------|
| **Technicians** | Fast voice input, AI-generated warranty stories, one-click PDF export |
| **Service Managers** | Complete visibility, user management, full audit trail with hash chaining |
| **Fixed Ops Directors** | Enterprise-ready platform with strong security, session controls, and compliance features |

---

## Key Features

- Voice-first input with stable text editing and cursor preservation
- Grok AI-powered intelligent warranty story generation
- AES-256-GCM encryption at rest for all sensitive data
- Immutable SHA-256 hash-chained audit trail
- Client-side image compression and secure blob storage
- Professional branded PDF generation
- Role-based access control with instant session revocation

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Frontend["Browser — Next.js 15 + React 19"]
        T1[Voice + Stable Text Editing]
        T2[OCR + Image Compression]
        T1 --> T2
    end

    subgraph Backend["Next.js API Routes"]
        B1[JWT Auth + Session Revocation]
        B2[Server-side AES-256 Encryption]
        B3[Grok AI Story Generation]
        B4[Structured Logging]
        B1 --> B2 --> B3 --> B4
    end

    subgraph Services["Data & Services"]
        S1[(PostgreSQL)]
        S2[Vercel Blob]
        S3[xAI Grok API]
    end

    subgraph Audit["Audit Trail"]
        A1[SHA-256 Hash Chain per Dealership]
    end

    T2 --> Backend
    B4 --> S1
    B4 --> Audit
    Backend --> S2
    Backend --> S3
```

---

## Common Failure Modes & Troubleshooting

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Grok API Timeout** | Long loading or timeout message | Shorten input and click **Regenerate** |
| **Voice Input Not Working** | Microphone button does nothing | Allow microphone permission in Chrome or Edge |
| **PDF Generation Failed** | "Failed to generate PDF" | Fill all required fields, then regenerate story |
| **Frequent Logouts** | Session expires often | Check device time or clear browser cache |

---

## Getting Started

```bash
git clone https://github.com/Nicequantum/viti-ai-clone.git
cd viti-ai-clone
npm install
cp .env.example .env
npm run db:migrate:deploy
npm run dev
```

---

**Important:** This system requires a signed Data Processing Agreement (DPA) with xAI before processing real customer or vehicle data in production.

Built specifically for Mercedes-Benz Fixed Operations teams.