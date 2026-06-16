/**
 * POST /api/pricing-config/[id]/activate
 *
 * Nastaví zvolenou config jako jedinou aktivní (deaktivuje ostatní).
 * Pozn.: Order si drží snapshot pravidel v Order.pricingConfigSnapshot —
 * aktivace nové config NEZMĚNÍ existující Order výpočty automaticky.
 * UI v sekci "Cenotvorba" zakázky pak nabídne "přepočítat zakázku s novou config".
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const cfgId = parseInt(id, 10);
  const cfg = await prisma.pricingConfig.findUnique({ where: { id: cfgId } });
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.pricingConfig.updateMany({ where: { active: true, NOT: { id: cfgId } }, data: { active: false } });
    await tx.pricingConfig.update({ where: { id: cfgId }, data: { active: true } });
  });

  await logActivity(session.id, 'pricing_config.activate', String(cfgId), JSON.stringify({ name: cfg.name }));
  return NextResponse.json({ success: true, activeConfigId: cfgId });
}
