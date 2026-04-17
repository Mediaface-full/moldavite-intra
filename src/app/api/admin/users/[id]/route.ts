import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import * as bcrypt from 'bcryptjs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email.includes('@') || email.length < 3) {
      return NextResponse.json({ error: 'Neplatný email' }, { status: 400 });
    }
    // Check uniqueness (skip if same user keeps the same email)
    const existing = await prisma.user.findUnique({ where: { email } });
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
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return NextResponse.json({ error: 'Heslo musí mít min. 6 znaků' }, { status: 400 });
    }
    data.password = await bcrypt.hash(body.password, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nic k úpravě' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  const changedFields = Object.keys(data).filter((k) => k !== 'password').join(',') + (data.password ? ',password' : '');
  await logActivity(session.id, 'admin.user.update', user.email, `Upraveno: ${changedFields}`);

  return NextResponse.json(user);
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
