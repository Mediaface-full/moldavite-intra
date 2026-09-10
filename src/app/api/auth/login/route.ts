import { NextResponse } from 'next/server';
import { authenticateUser, createToken, logActivity } from '@/lib/auth';
import { checkRateLimit, resetRateLimit, getClientIp } from '@/lib/rateLimit';
import { issueCsrfToken, CSRF_COOKIE_NAME, csrfCookieOptions } from '@/lib/csrf';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
// Per-účet limit — nezávislý na IP, takže ho nejde obejít podvrženou
// X-Forwarded-For hlavičkou (audit 10. 9. 2026). Stejné okno jako IP limit.
const MAX_ATTEMPTS_PER_ACCOUNT = 10;
const MAX_EMAIL_LEN = 254;
const MAX_PASSWORD_LEN = 1024;

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Příliš mnoho pokusů, zkuste to později' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipKey = `login:ip:${ip}`;
  const rlIp = checkRateLimit(ipKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!rlIp.ok) return tooMany(rlIp.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  }
  const rec = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = typeof rec.email === 'string' ? rec.email.trim() : '';
  const password = typeof rec.password === 'string' ? rec.password : '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email a heslo jsou povinné' }, { status: 400 });
  }
  if (email.length > MAX_EMAIL_LEN || password.length > MAX_PASSWORD_LEN) {
    return NextResponse.json({ error: 'Nesprávný email nebo heslo' }, { status: 401 });
  }

  const accountKey = `login:acct:${email.toLowerCase()}`;
  const rlAcct = checkRateLimit(accountKey, MAX_ATTEMPTS_PER_ACCOUNT, WINDOW_MS);
  if (!rlAcct.ok) return tooMany(rlAcct.retryAfterSec);

  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json({ error: 'Nesprávný email nebo heslo' }, { status: 401 });
  }

  resetRateLimit(ipKey);
  resetRateLimit(accountKey);
  const token = createToken(user);

  await logActivity(user.id, 'auth.login', '', `Přihlášení: ${user.email}`, ip);

  const response = NextResponse.json({ user });
  response.cookies.set('moldavite_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60,
    path: '/',
  });
  // Double-submit CSRF token. Clients read this cookie and echo it as
  // x-csrf-token header on state-changing calls.
  response.cookies.set(
    CSRF_COOKIE_NAME,
    issueCsrfToken(),
    csrfCookieOptions(process.env.NODE_ENV === 'production')
  );

  return response;
}
