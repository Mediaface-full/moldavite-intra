// Client-side fetch wrapper that automatically attaches the CSRF header
// for state-changing methods. Safe to call from server components too —
// it just becomes a plain fetch there (no document.cookie access).

import { CSRF_COOKIE_NAME, CSRF_HEADER } from './csrf';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const raw of document.cookie.split(';')) {
    const trimmed = raw.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});

  if (MUTATION_METHODS.has(method)) {
    const token = readCookie(CSRF_COOKIE_NAME);
    if (token && !headers.has(CSRF_HEADER)) {
      headers.set(CSRF_HEADER, token);
    }
  }

  return fetch(input, { ...init, headers });
}
