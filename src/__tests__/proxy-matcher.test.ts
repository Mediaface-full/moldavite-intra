/**
 * Regresní test pro CRITICAL nález z auditu 10. 9. 2026:
 *
 * proxy.ts matcher měl `missing: [next-router-prefetch, purpose: prefetch]`
 * (zkopírováno z Next docs CSP příkladu). Request s takovou hlavičkou proxy
 * úplně přeskočil → stránky bez vlastního session checku (/, /items, /boxes,
 * /export …) šly načíst bez přihlášení. Ověřeno naostro na produkci.
 *
 * Tento test hlídá, že (a) matcher žádnou `missing`/`has` výjimku nemá a
 * (b) proxy funkce samotná neautentizovaný request s prefetch hlavičkou
 * pošle na /login (resp. 401 pro API).
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy, config } from '@/proxy';

describe('proxy matcher — žádná prefetch výjimka', () => {
  it('matcher je pole stringů bez `missing`/`has` podmínek', () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    for (const entry of config.matcher as unknown[]) {
      expect(typeof entry).toBe('string');
    }
  });
});

describe('proxy — výjimka na statickou příponu jen pro kořenové soubory', () => {
  // Audit 10. 9. 2026: `/items/1.svg` dřív prošlo bez auth (dynamic segment +
  // parseInt("1.svg") === 1) → detail kamene s nákupní cenou veřejně.
  const BLOCKED = ['/items/1.svg', '/boxes/7.png', '/orders/3.css', '/items/1abc.svg', '/admin/users.txt', '/vseved/knihy.js'];
  for (const p of BLOCKED) {
    it(`${p} bez cookie → redirect na /login`, () => {
      const res = proxy(new NextRequest(`https://app.example.com${p}`));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://app.example.com/login');
    });
  }
  it('/api/certificate/1.svg bez cookie → 401', () => {
    const res = proxy(new NextRequest('https://app.example.com/api/certificate/1.svg'));
    expect(res.status).toBe(401);
  });
  const ALLOWED = ['/logo.svg', '/logo-white.svg', '/favicon.ico', '/apple-icon.png', '/icon.svg', '/_next/static/chunks/x.js', '/images/K0001/0001/01.jpg'];
  for (const p of ALLOWED) {
    it(`${p} projde bez auth (statický asset)`, () => {
      const res = proxy(new NextRequest(`https://app.example.com${p}`));
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  }
});

describe('proxy — CSRF default-deny na /api/ mutacích', () => {
  // Validní JWT potřebujeme, aby se došlo až ke CSRF kontrole. Secret jen pro test.
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret-1234';
  const jwtLib = require('jsonwebtoken') as typeof import('jsonwebtoken');
  const token = jwtLib.sign({ id: 1, email: 'a@b.cz', name: null, role: 'ADMIN', tokenVersion: 0 }, process.env.NEXTAUTH_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  const cookie = `moldavite_session=${token}`;

  const MUTATING = ['/api/library/books', '/api/library/categories/3', '/api/auth/logout', '/api/export', '/api/sellers', '/api/anything/new'];
  for (const p of MUTATING) {
    it(`POST ${p} s JWT ale bez CSRF headeru → 403`, () => {
      const res = proxy(new NextRequest(`https://app.example.com${p}`, { method: 'POST', headers: { cookie } }));
      expect(res.status).toBe(403);
    });
  }
  it('POST /api/auth/login bez CSRF → projde (výjimka)', () => {
    const res = proxy(new NextRequest('https://app.example.com/api/auth/login', { method: 'POST' }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
  it('GET /api/library/books s JWT → projde (CSRF jen na mutace)', () => {
    const res = proxy(new NextRequest('https://app.example.com/api/library/books', { headers: { cookie } }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
  it('POST s matching double-submit tokenem → projde', () => {
    const csrf = 'a'.repeat(64);
    const res = proxy(new NextRequest('https://app.example.com/api/library/books', {
      method: 'POST',
      headers: { cookie: `${cookie}; moldavite_csrf=${csrf}`, 'x-csrf-token': csrf },
    }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
  it('401 odpověď z proxy nese security hlavičky', () => {
    const res = proxy(new NextRequest('https://app.example.com/api/items'));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('proxy — neautentizovaný request s prefetch hlavičkou', () => {
  const HEADERS: Record<string, string>[] = [
    { purpose: 'prefetch' },
    { 'next-router-prefetch': '1' },
    { 'next-router-prefetch': '1', rsc: '1' },
  ];

  for (const headers of HEADERS) {
    it(`stránka /items → redirect na /login (${JSON.stringify(headers)})`, () => {
      const req = new NextRequest('https://app.example.com/items', { headers });
      const res = proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://app.example.com/login');
    });

    it(`API /api/items → 401 (${JSON.stringify(headers)})`, async () => {
      const req = new NextRequest('https://app.example.com/api/items', { headers });
      const res = proxy(req);
      expect(res.status).toBe(401);
    });
  }
});
