import { prisma } from './prisma';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'moldavite_session';
const JWT_ALGO = 'HS256' as const;
const JWT_EXPIRES_IN = '1d';

function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret) throw new Error('NEXTAUTH_SECRET environment variable is required');
  if (secret.length < 32) {
    throw new Error('NEXTAUTH_SECRET must be at least 32 characters (use: openssl rand -base64 32)');
  }
  return secret;
}

// Pre-hashed dummy used for constant-time bcrypt.compare when user does not exist.
// Lazy-initialised so module import stays cheap (and safe) during `next build`.
let _dummyHash: string | null = null;
function getDummyHash(): string {
  if (_dummyHash === null) _dummyHash = bcrypt.hashSync('___unreachable_dummy___', 10);
  return _dummyHash;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  tokenVersion?: number; // snapshot at token creation; verified against DB in getSession
}

export async function authenticateUser(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt.compare to prevent user enumeration via timing attacks.
  const hashToCheck = user?.password || getDummyHash();
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!user || !valid) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion };
}

export function createToken(user: SessionUser): string {
  return jwt.sign(user, getJwtSecret(), { algorithm: JWT_ALGO, expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGO] }) as SessionUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;

  // Check token version against DB — lets us invalidate all outstanding
  // tokens for a user by bumping tokenVersion (on logout, password change,
  // admin revocation). One extra indexed query per request; negligible for
  // our intranet scale.
  const current = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: { tokenVersion: true, role: true, email: true, name: true },
  });
  if (!current) return null;
  if ((decoded.tokenVersion ?? 0) !== current.tokenVersion) return null;

  // Role can change in DB without re-login; always return the DB-current value.
  return {
    id: decoded.id,
    email: current.email,
    name: current.name,
    role: current.role,
    tokenVersion: current.tokenVersion,
  };
}

// Bump a user's tokenVersion, invalidating every outstanding JWT for them.
// Call on logout, password change, or admin-triggered revoke.
export async function invalidateUserTokens(userId: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== 'ADMIN') {
    throw new Error('FORBIDDEN');
  }
  return session;
}

export async function logActivity(userId: number, action: string, target: string = '', details: string = '', ip: string = '') {
  await prisma.activityLog.create({
    data: { userId, action, target, details, ip },
  });
}
