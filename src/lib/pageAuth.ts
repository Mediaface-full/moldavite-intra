/**
 * Server-side auth guardy pro App Router stránky (page.tsx).
 *
 * PROČ EXISTUJÍ (audit 10. 9. 2026): proxy.ts je jen první vrstva. Každá
 * stránka, která renderuje data server-side, MUSÍ mít vlastní kontrolu
 * session — jinak jakákoli mezera v proxy matcheru (historicky: `missing`
 * výjimka pro `purpose: prefetch`, která proxy úplně přeskočila) znamená
 * únik dat bez přihlášení. API routes už to dělají (`getSession()` v každém
 * handleru); tohle je ekvivalent pro stránky.
 *
 * Použití (server component):
 *   const session = await requirePageSession();          // 401 → /login
 *   const session = await requirePageAdmin();            // ne-admin → /
 */
import { redirect } from 'next/navigation';
import { getSession, type SessionUser } from './auth';

export async function requirePageSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requirePageAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/');
  return session;
}
