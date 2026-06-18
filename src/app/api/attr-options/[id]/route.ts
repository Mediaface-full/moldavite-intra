import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

const ALLOWED_PATCH = ['value', 'label', 'sortOrder', 'active'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const optId = parseInt(id, 10);
  if (Number.isNaN(optId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (data.value !== undefined && (typeof data.value !== 'string' || (data.value as string).trim().length === 0)) {
    return NextResponse.json({ error: 'value nesmí být prázdný' }, { status: 422 });
  }
  if (data.sortOrder !== undefined && typeof data.sortOrder !== 'number') {
    return NextResponse.json({ error: 'sortOrder musí být číslo' }, { status: 422 });
  }
  if (data.value && typeof data.value === 'string') data.value = data.value.trim();

  try {
    const updated = await prisma.attrOption.update({ where: { id: optId }, data });
    await logActivity(session.id, 'attr_option.update', `${updated.attrKey}:${updated.value}`, JSON.stringify(Object.keys(data)));
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Hodnota s tímto názvem už existuje' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const optId = parseInt(id, 10);
  if (Number.isNaN(optId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await prisma.attrOption.findUnique({ where: { id: optId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Pozn.: nemažeme fyzicky pokud nějaký kámen hodnotu používá. Místo toho
  // doporučujeme přes UI nastavit active=false (soft delete) — kámen tu
  // hodnotu drží, jen se nezobrazuje v nových selectech. Tady ale dovolíme
  // fyzické smazání pokud uživatel explicitně chce (kámen pak má "orphan"
  // hodnotu, kterou margin engine vyhodnotí podle missingPolicy).
  await prisma.attrOption.delete({ where: { id: optId } });
  await logActivity(session.id, 'attr_option.delete', `${existing.attrKey}:${existing.value}`, '');
  return NextResponse.json({ success: true });
}
