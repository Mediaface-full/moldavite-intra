import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { CSRF_COOKIE_NAME, csrfCookieOptions, issueCsrfToken } from '@/lib/csrf';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // Ensure the CSRF cookie exists for sessions created before the CSRF
  // rollout, or after a browser cookie wipe. Issued only when missing so
  // existing tokens stay stable across tabs.
  const existing = (await cookies()).get(CSRF_COOKIE_NAME)?.value;
  const response = NextResponse.json({ user: session });
  if (!existing) {
    response.cookies.set(
      CSRF_COOKIE_NAME,
      issueCsrfToken(),
      csrfCookieOptions(process.env.NODE_ENV === 'production')
    );
  }
  return response;
}
