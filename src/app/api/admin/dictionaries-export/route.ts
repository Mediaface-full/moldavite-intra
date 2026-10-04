/**
 * GET /api/admin/dictionaries-export?format=md|json — ADMIN
 *
 * Export číselníků kamenů ze živé DB (AttrOption + počty použití na
 * kamenech/kazetách). Markdown ke stažení (default) nebo JSON.
 * Tlačítko v /admin/attributes. Generátor: lib/dictionariesExport.ts.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import {
  buildDictionariesMarkdown, buildDictionariesJson, dictionariesExportFilename, type DictUsage,
} from '@/lib/dictionariesExport';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') === 'json' ? 'json' : 'md';

  const [options, byLocation, byShape, byDamage, colors, byCassette] = await Promise.all([
    prisma.attrOption.findMany({
      select: { attrKey: true, value: true, label: true, labelEn: true, sortOrder: true, active: true },
    }),
    prisma.item.groupBy({ by: ['location'], _count: { _all: true }, where: { location: { not: '' } } }),
    prisma.item.groupBy({ by: ['pasShape'], _count: { _all: true }, where: { pasShape: { not: '' } } }),
    prisma.item.groupBy({ by: ['attrDamage'], _count: { _all: true }, where: { attrDamage: { not: '' } } }),
    prisma.item.findMany({ select: { attrColor: true }, where: { NOT: { attrColor: { isEmpty: true } } } }),
    prisma.box.groupBy({ by: ['cassetteType'], _count: { _all: true } }),
  ]);

  const usage: DictUsage = { location: {}, pasShape: {}, attrDamage: {}, attrColor: {}, cassetteType: {} };
  for (const r of byLocation) usage.location[r.location] = r._count._all;
  for (const r of byShape) usage.pasShape[r.pasShape] = r._count._all;
  for (const r of byDamage) usage.attrDamage[r.attrDamage] = r._count._all;
  for (const it of colors) for (const c of it.attrColor) if (c) usage.attrColor[c] = (usage.attrColor[c] ?? 0) + 1;
  for (const r of byCassette) usage.cassetteType[r.cassetteType] = r._count._all;

  const generatedAt = new Date();
  const filename = dictionariesExportFilename(generatedAt, format);
  await logActivity(session.id, 'attr_option.export', format, JSON.stringify({ options: options.length }));

  if (format === 'json') {
    return new NextResponse(JSON.stringify(buildDictionariesJson({ options, usage, generatedAt }), null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(buildDictionariesMarkdown({ options, usage, generatedAt }), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
