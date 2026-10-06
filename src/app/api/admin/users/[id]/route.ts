import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import {
  getSession, logActivity, normalizeEmail, findUserByEmail, createToken,
  SESSION_COOKIE_NAME, sessionCookieOptions,
} from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { tmplPasswordChanged } from '@/lib/emailTemplates';
import { getClientIp } from '@/lib/rateLimit';
import * as bcrypt from 'bcryptjs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    data.name = typeof body.name === 'string' ? body.name.trim() : '';
  }

  if (body.email !== undefined) {
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email.includes('@') || email.length < 3) {
      return NextResponse.json({ error: 'Neplatný email' }, { status: 400 });
    }
    // Unikátnost bez ohledu na velikost písmen (skip if same user keeps the same email)
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: 'Email je už použitý jiným uživatelem' }, { status: 409 });
    }
    data.email = email;
  }

  if (body.role !== undefined) {
    if (body.role !== 'ADMIN' && body.role !== 'USER') {
      return NextResponse.json({ error: 'Neplatná role' }, { status: 400 });
    }
    // Don't let the last admin demote themselves to USER.
    if (body.role === 'USER' && userId === session.id) {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Nelze odebrat poslední admin účet' }, { status: 400 });
      }
    }
    data.role = body.role;
  }

  if (body.password) {
    if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024) {
      return NextResponse.json({ error: 'Heslo musí mít min. 12 znaků' }, { status: 400 });
    }
    data.password = await bcrypt.hash(body.password, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nic k úpravě' }, { status: 400 });
  }

  // Bump tokenVersion so every outstanding JWT for this user stops working
  // whenever a security-relevant field changes (password/email/role).
  const securityRelevant = data.password !== undefined || data.email !== undefined || data.role !== undefined;
  if (securityRelevant) {
    (data as Record<string, unknown>).tokenVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true, tokenVersion: true },
  });
  const { tokenVersion, ...user } = updated;

  const changedFields = Object.keys(data).filter((k) => k !== 'password' && k !== 'tokenVersion').join(',') + (data.password ? ',password' : '');
  await logActivity(session.id, 'admin.user.update', user.email, `Upraveno: ${changedFields}`);

  const response = NextResponse.json(user);

  // Admin měnil SÁM SOBĚ heslo/e-mail/roli → bump tokenVersion zneplatnil
  // i jeho vlastní session a další request skončil 403 / redirect na login.
  // V UI to vypadalo jako „změna hesla nefunguje" (Gideon 6. 10. 2026).
  // Vydáme mu rovnou nový token s novou verzí; cizí sessions zůstávají
  // zneplatněné (to je záměr).
  if (securityRelevant && userId === session.id) {
    const token = createToken({ id: user.id, email: user.email, name: user.name, role: user.role, tokenVersion });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  }

  // Notify the user when their password changed (regardless of who did it).
  if (data.password) {
    try {
      await sendEmail(tmplPasswordChanged({
        to: user.email,
        name: user.name,
        changedBy: session.id === userId ? 'self' : 'admin',
        ip,
        when: new Date(),
      }));
    } catch (err) {
      console.error('[admin/users] password-changed email failed:', err);
    }
  }

  return response;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id);

  if (userId === session.id) {
    return NextResponse.json({ error: 'Nemůžete smazat sám sebe' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await logActivity(session.id, 'admin.user.delete', user.email, `Smazán uživatel: ${user.email}`);
  }

  return NextResponse.json({ success: true });
}
