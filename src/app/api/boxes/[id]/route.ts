import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const boxId = parseInt(id);
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.placement !== undefined) data.placement = body.placement;

  const box = await prisma.box.update({
    where: { id: boxId },
    data,
  });

  // If placement changed, propagate to all items in this box that still have default (empty) storage
  if (body.placement !== undefined && body.propagatePlacement) {
    await prisma.item.updateMany({
      where: { boxId, storage: '' },
      data: { storage: body.placement },
    });
    await logActivity(session.id, 'box.placement', box.code, `Umístění: ${body.placement} (propsáno ke kamenům)`);
  } else if (body.placement !== undefined) {
    await logActivity(session.id, 'box.placement', box.code, `Umístění: ${body.placement}`);
  }

  return NextResponse.json(box);
}
