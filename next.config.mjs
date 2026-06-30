import path from 'path';
import { fileURLToPath } from 'url';
import { withSentryConfig } from '@sentry/nextjs';
import { BASE_SECURITY_HEADERS } from './security-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBuildCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.NEXT_PUBLIC_BUILD_COMMIT || 'dev';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: resolveBuildCommit(),
    NEXT_PUBLIC_BUILD_DATE: process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString(),
  },
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdfjs-dist': path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
    };
    return config;
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'sonner', '@sentry/nextjs'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const securityHeaders = [
      ...(isProduction
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
        : []),
      ...BASE_SECURITY_HEADERS,
    ];

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "clarityauto",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});