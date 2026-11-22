import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';

/** ADMIN session, jinak 403 odpověď. */
export async function requireAdminApi(): Promise<SessionUser | NextResponse> {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return session;
}

/** BigInt → string pro JSON. */
export function jsonSafe<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)));
}
