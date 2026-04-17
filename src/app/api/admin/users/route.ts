import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Uživatel s tímto emailem již existuje' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: name || null,
      role: role === 'ADMIN' ? 'ADMIN' : 'USER',
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  await logActivity(session.id, 'admin.user.create', user.email, `Vytvořen uživatel: ${user.email} (${user.role})`);

  return NextResponse.json(user, { status: 201 });
}
