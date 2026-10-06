import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity, normalizeEmail, findUserByEmail } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { tmplWelcomeUser } from '@/lib/emailTemplates';
import * as bcrypt from 'bcryptjs';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, password, name, role } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email a heslo jsou povinné' }, { status: 400 });
  }
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254) {
    return NextResponse.json({ error: 'Neplatný email nebo heslo' }, { status: 400 });
  }
  // Min. 12 znaků (audit 10. 9. 2026) — jediná brute-force bariéra po rate limitu.
  if (password.length < 12 || password.length > 1024) {
    return NextResponse.json({ error: 'Heslo musí mít min. 12 znaků' }, { status: 400 });
  }

  // E-mail ukládat malými písmeny a unikátnost hlídat bez ohledu na velikost
  // (6. 10. 2026 — dřív create ukládal jak přišlo, login porovnával přesně).
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail.includes('@') || normalizedEmail.length < 3) {
    return NextResponse.json({ error: 'Neplatný email' }, { status: 400 });
  }
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    return NextResponse.json({ error: 'Uživatel s tímto emailem již existuje' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      name: name || null,
      role: role === 'ADMIN' ? 'ADMIN' : 'USER',
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  await logActivity(session.id, 'admin.user.create', user.email, `Vytvořen uživatel: ${user.email} (${user.role})`);

  // Welcome email — silently no-op if SMTP isn't configured.
  try {
    await sendEmail(tmplWelcomeUser({ to: user.email, name: user.name, password }));
  } catch (err) {
    console.error('[admin/users] welcome email failed:', err);
  }

  return NextResponse.json(user, { status: 201 });
}
