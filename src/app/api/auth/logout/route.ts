import { NextResponse } from 'next/server';
import { getSession, invalidateUserTokens } from '@/lib/auth';

export async function POST() {
  const session = await getSession();
  if (session) {
    // Invalidate every outstanding JWT for this user so a stolen cookie
    // stops working the instant the owner hits logout.
    await invalidateUserTokens(session.id);
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set('moldavite_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return response;
}
