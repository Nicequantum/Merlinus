/**
 * Smoke test: production HTML at / must include the login shell before any client JS runs.
 * Run after `next build` + `next start`.
 */
const baseUrl = process.env.MERLIN_BASE_URL ?? 'http://localhost:3457';

const required = [
  'login-shell',
  'Mercedes-Benz D7 Number',
  'Sign in',
  'login-submit-btn',
];

const res = await fetch(baseUrl, { headers: { Accept: 'text/html' } });
if (!res.ok) {
  console.error(`[login-first-paint] HTTP ${res.status} from ${baseUrl}`);
  process.exit(1);
}

const html = await res.text();
const missing = required.filter((needle) => !html.includes(needle));
if (missing.length > 0) {
  console.error('[login-first-paint] Missing markers in HTML:', missing.join(', '));
  process.exit(1);
}

console.log('[login-first-paint] OK — login shell present in SSR HTML');