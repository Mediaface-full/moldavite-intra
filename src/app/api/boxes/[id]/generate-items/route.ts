/**
 * POST /api/boxes/[id]/generate-items
 * Body: { count: number }
 *
 * Doplní prázdné Item záznamy v kazetě tak, aby celkem bylo `count` kamenů.
 * Pokud kazeta už má víc kamenů než count → no-op, vrátí varování.
 * Pokud má míň → doplní rozdíl s evidNumber = MAX(existující) + 1, ... (vyplněné na 4 číslice).
 *
 * Pro každý nový Item vytvoří složku na disku:
 *   <PHOTOS_PATH>/<box.code>/<evidNumber>/
 * aby tam mohl uživatel přes FTP nahrát fotky.
 *
 * Plus update Box.declaredPieces = count.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const boxId = parseInt(id, 10);
  if (Number.isNaN(boxId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { count?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const count = Number(body.count);
  if (!Number.isFinite(count) || count < 1 || count > 999 || !Number.isInteger(count)) {
    return NextResponse.json({ error: 'count musí být celé číslo 1–999' }, { status: 422 });
  }

  const box = await prisma.box.findUnique({
    where: { id: boxId },
    include: { items: { select: { evidNumber: true }, orderBy: { evidNumber: 'asc' } } },
  });
  if (!box) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = box.items.length;
  if (count <= existing) {
    return NextResponse.json({
      success: true, created: 0, skipped: true,
      message: `Kazeta už má ${existing} kamenů — žádné nové se nevytvoří. Pokud potřebuješ smazat, udělej to ručně.`,
    });
  }

  // Najdi max evidNumber a doplň od dalšího
  const maxNumeric = box.items.reduce((max, it) => {
    const n = parseInt(it.evidNumber, 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const toCreate = count - existing;
  const newNumbers: string[] = [];
  for (let i = 1; i <= toCreate; i++) {
    newNumbers.push(String(maxNumeric + i).padStart(4, '0'));
  }

  // Vytvoříme items v transakci
  await prisma.$transaction(async (tx) => {
    for (const evidNumber of newNumbers) {
      await tx.item.create({
        data: {
          boxId: box.id,
          evidNumber,
          orderId: box.orderId,
          pricingStatus: 'NEEDS_INPUT',
        },
      });
    }
    await tx.box.update({
      where: { id: box.id },
      data: { declaredPieces: count },
    });
  });

  // Vytvoříme folders na disku — best-effort, případná chyba se zaloguje
  // (uživatel může nahrát fotky přes UI modal i bez existující složky).
  const photosBase = process.env.PHOTOS_PATH || '/data/photos';
  let foldersCreated = 0;
  let foldersFailed = 0;
  if (fs.existsSync(photosBase)) {
    for (const evidNumber of newNumbers) {
      const folder = path.join(photosBase, box.code, evidNumber);
      try {
        fs.mkdirSync(folder, { recursive: true });
        foldersCreated++;
      } catch (err) {
        foldersFailed++;
        console.error(`[generate-items] mkdir failed: ${folder}`, err);
      }
    }
  }

  await logActivity(
    session.id, 'box.generate_items', box.code,
    JSON.stringify({ created: toCreate, total: count, foldersCreated, foldersFailed })
  );

  return NextResponse.json({
    success: true,
    created: toCreate,
    total: count,
    foldersCreated,
    foldersFailed,
    newNumbers,
  }, { status: 201 });
}
