# Merlin — Mercedes-Benz Warranty Story Generator

**Secure AI-Powered Warranty Documentation Platform for Mercedes-Benz Dealerships**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Security](https://img.shields.io/badge/Security-Enterprise_Grade-22c55e?style=for-the-badge)](https://github.com/Nicequantum/viti-ai-clone)

A secure, enterprise-grade platform that enables Mercedes-Benz service technicians to generate accurate, professional warranty narratives using Grok AI — complete with voice input, field-level encryption, and a tamper-evident audit trail.

---

## Who This Is For

| Role | What You Get |
|------|--------------|
| **Technicians** | Fast voice-to-story workflow and professional PDF output |
| **Service Managers** | Full visibility, audit logs, user management, and compliance tools |
| **Fixed Ops Directors** | A secure, auditable, and scalable warranty documentation system |

---

## Key Features

- Voice-first input with stable text editing during dictation
- Intelligent Grok AI-powered warranty story generation
- AES-256-GCM encryption for all sensitive data
- Immutable SHA-256 hash-chained audit trail
- Client-side image compression and secure storage
- Professional branded PDF generation
- Role-based access control with instant session revocation
- Built for reliability in high-pressure dealership environments

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Frontend["Frontend — Next.js 15 + React 19"]
        A[Voice + Stable Text Editing]
        B[OCR + Image Compression]
        A --> B
    end

    subgraph Security["Security Layer"]
        C[JWT Auth + Session Revocation]
        D[Server-side AES-256-GCM Encryption]
        C --> D
    end

    subgraph Backend["Backend — Next.js API Routes"]
        E[Grok AI Story Generation]
        D --> E
    end

    subgraph Audit["Audit Trail"]
        F[SHA-256 Hash-Chained Logging]
        E --> F
    end

    subgraph Output["Output"]
        G[Branded PDF Export]
        E --> G
    end

    B --> C

    classDef frontend fill:#dbeafe,stroke:#1e40af
    classDef security fill:#dcfce7,stroke:#166534
    classDef audit fill:#fef3c7,stroke:#92400e
    class A,B frontend
    class C,D security
    class F audit
```

---

## Common Failure Modes & Troubleshooting

| Issue | Error Message / Symptom | Recommended Fix |
|-------|-------------------------|-----------------|
| **Grok API Timeout** | Request timed out or long loading spinner | Shorten your input and click **Regenerate** |
| **Voice Input Not Working** | Microphone does not respond | Allow microphone permission in Chrome or Edge |
| **PDF Generation Failed** | Failed to generate PDF | Ensure all required fields are filled, then regenerate story |
| **Session Expiring Frequently** | Logged out unexpectedly | Check device clock or clear browser cache |
| **Audit Chain Warning** | Hash chain integrity error | Stop use and notify IT immediately |

---

## Getting Started

```bash
git clone https://github.com/Nicequantum/viti-ai-clone.git
cd viti-ai-clone
npm install
cp .env.example .env.local
npm run dev
```

---

**Important:** A signed Data Processing Agreement with xAI is required before processing real customer or vehicle data.

Built specifically for Mercedes-Benz Fixed Operations teams that demand both speed and full accountability.