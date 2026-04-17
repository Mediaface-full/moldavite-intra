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
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.role !== undefined) data.role = body.role;
  if (body.password) data.password = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.update({
    where: { id: parseInt(id) },
    data,
    select: { id: true, email: true, name: true, role: true },
  });

  await logActivity(session.id, 'admin.user.update', user.email, `Upraven uživatel: ${user.email}`);

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
