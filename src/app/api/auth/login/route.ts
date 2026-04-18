import { NextResponse } from 'next/server';
import { authenticateUser, createToken, logActivity } from '@/lib/auth';
import { checkRateLimit, resetRateLimit, getClientIp } from '@/lib/rateLimit';
import { issueCsrfToken, CSRF_COOKIE_NAME, csrfCookieOptions } from '@/lib/csrf';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rlKey = `login:${ip}`;
  const rl = checkRateLimit(rlKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Příliš mnoho pokusů, zkuste to později' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email a heslo jsou povinné' }, { status: 400 });
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json({ error: 'Nesprávný email nebo heslo' }, { status: 401 });
  }

  resetRateLimit(rlKey);
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
