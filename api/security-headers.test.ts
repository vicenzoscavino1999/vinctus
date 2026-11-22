import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface VercelHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

interface VercelRewriteRule {
  source: string;
  destination: string;
}

interface VercelConfig {
  git?: { deploymentEnabled?: Record<string, boolean> };
  headers?: VercelHeaderRule[];
  rewrites?: VercelRewriteRule[];
}

const rootDir = process.cwd();
const vercelConfig = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, 'vercel.json'), 'utf8'),
) as VercelConfig;

const findHeaderRule = (source: string) =>
  vercelConfig.headers?.find((entry) => entry.source === source);

const findHeaderValue = (rule: VercelHeaderRule | undefined, key: string) =>
  rule?.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;

describe('vercel.json web security and staging isolation', () => {
  it('keeps production Firebase rewrites pointed strictly at vinctus-daf32 and disables staging auto-deploys', () => {
    expect(vercelConfig.git?.deploymentEnabled?.['testflight/vinctus-staging']).toBe(false);

    const authRewrite = vercelConfig.rewrites?.find((entry) => entry.source === '/__/auth/(.*)');
    const firebaseRewrite = vercelConfig.rewrites?.find(
      (entry) => entry.source === '/__/firebase/(.*)',
    );
    expect(authRewrite?.destination).toBe('https://vinctus-daf32.firebaseapp.com/__/auth/$1');
    expect(firebaseRewrite?.destination).toBe(
      'https://vinctus-daf32.firebaseapp.com/__/firebase/$1',
    );
    expect(JSON.stringify(vercelConfig.rewrites)).not.toContain('vinctus-staging');
  });

  it('does not apply the strict SPA CSP onto proxied Firebase Auth /__/auth/* routes', () => {
    const globalRule = findHeaderRule('/(.*)');
    expect(findHeaderValue(globalRule, 'Content-Security-Policy')).toBeUndefined();
    expect(findHeaderValue(globalRule, 'Strict-Transport-Security')).toContain('max-age=31536000');
    expect(findHeaderValue(globalRule, 'X-Content-Type-Options')).toBe('nosniff');
    expect(findHeaderValue(globalRule, 'Permissions-Policy')).toContain('microphone=(self)');
    expect(findHeaderValue(globalRule, 'Permissions-Policy')).toContain('camera=()');

    const appRule = findHeaderRule('/((?!__/auth/|__/firebase/|api/).*)');
    expect(appRule).toBeDefined();

    // Verify regex matching matches app/legal routes and excludes Firebase proxy and API routes
    const pattern = new RegExp(`^${appRule!.source}$`);
    expect(pattern.test('/')).toBe(true);
    expect(pattern.test('/discover')).toBe(true);
    expect(pattern.test('/privacy.html')).toBe(true);
    expect(pattern.test('/__/auth/handler')).toBe(false);
    expect(pattern.test('/__/auth/iframe')).toBe(false);
    expect(pattern.test('/__/firebase/init.json')).toBe(false);
    expect(pattern.test('/api/chat')).toBe(false);

    const csp = findHeaderValue(appRule, 'Content-Security-Policy') ?? '';
    const scriptSrc = csp
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src '));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toContain('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
    expect(scriptSrc).not.toMatch(/https:\/\/cdn\.jsdelivr\.net(\s|$)/);
  });

  it('hardens /api/* headers and enforces no-store on /api/chat', () => {
    const apiRule = findHeaderRule('/api/(.*)');
    expect(findHeaderValue(apiRule, 'X-Frame-Options')).toBe('DENY');
    expect(findHeaderValue(apiRule, 'Referrer-Policy')).toBe('no-referrer');
    expect(findHeaderValue(apiRule, 'Content-Security-Policy')).toContain("default-src 'none'");

    const chatRule = findHeaderRule('/api/chat');
    expect(findHeaderValue(chatRule, 'Cache-Control')).toContain('no-store');
  });
});
