import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

const ALLOWED_PATCH = ['value', 'label', 'labelEn', 'sortOrder', 'active'];

/**
 * Spočti kolik kamenů / kazet drží tuto AttrOption hodnotu — pro safety
 * check před rename / delete.
 *
 * Mapping attrKey → Item / Box field:
 *   pasShape, attrDamage, location → Item.<field> = value (string)
 *   attrColor                       → Item.attrColor obsahuje value (string[])
 *   cassetteType                    → Box.cassetteType = value (string)
 */
async function countUsages(attrKey: string, value: string): Promise<number> {
  if (attrKey === 'pasShape') return prisma.item.count({ where: { pasShape: value } });
  if (attrKey === 'attrDamage') return prisma.item.count({ where: { attrDamage: value } });
  if (attrKey === 'location') return prisma.item.count({ where: { location: value } });
  if (attrKey === 'attrColor') return prisma.item.count({ where: { attrColor: { has: value } } });
  if (attrKey === 'cassetteType') return prisma.box.count({ where: { cassetteType: value } });
  return 0;
}

/**
 * Cascade rename — přepíše hodnotu na všech kamenech / kazetách kde se používá.
 * Vraci počet ovlivněných řádků (informativní).
 */
async function cascadeRename(attrKey: string, oldValue: string, newValue: string): Promise<number> {
  if (attrKey === 'pasShape') {
    const r = await prisma.item.updateMany({ where: { pasShape: oldValue }, data: { pasShape: newValue } });
    return r.count;
  }
  if (attrKey === 'attrDamage') {
    const r = await prisma.item.updateMany({ where: { attrDamage: oldValue }, data: { attrDamage: newValue } });
    return r.count;
  }
  if (attrKey === 'location') {
    const r = await prisma.item.updateMany({ where: { location: oldValue }, data: { location: newValue } });
    return r.count;
  }
  if (attrKey === 'cassetteType') {
    const r = await prisma.box.updateMany({ where: { cassetteType: oldValue }, data: { cassetteType: newValue } });
    return r.count;
  }
  if (attrKey === 'attrColor') {
    // attrColor je String[] — Prisma neumí array_replace, fallback na raw SQL
    const r = await prisma.$executeRawUnsafe(
      `UPDATE "Item" SET "attrColor" = array_replace("attrColor", $1, $2) WHERE $1 = ANY("attrColor")`,
      oldValue,
      newValue,
    );
    return r;
  }
  return 0;
}

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
  if (data.labelEn !== undefined) {
    if (data.labelEn === null || data.labelEn === '') data.labelEn = null;
    else if (typeof data.labelEn !== 'string') return NextResponse.json({ error: 'labelEn musí být string nebo null' }, { status: 422 });
    else data.labelEn = (data.labelEn as string).trim() || null;
  }

  // Pokud se mění `value` — udělej cascade rename na všech kamenech / kazetách
  // co tu hodnotu drží (transakce: UPDATE Item/Box → UPDATE AttrOption).
  // Bez toho by kameny zobrazily „(mimo aktivní seznam)" pro starou hodnotu.
  const renaming = data.value !== undefined;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.attrOption.findUnique({ where: { id: optId } });
      if (!current) throw new Error('NOT_FOUND');
      let cascadeCount = 0;
      if (renaming && data.value !== current.value) {
        cascadeCount = await cascadeRename(current.attrKey, current.value, data.value as string);
      }
      const updated = await tx.attrOption.update({ where: { id: optId }, data });
      return { updated, cascadeCount };
    });
    await logActivity(
      session.id,
      'attr_option.update',
      `${result.updated.attrKey}:${result.updated.value}`,
      JSON.stringify({ keys: Object.keys(data), cascadeCount: result.cascadeCount }),
    );
    return NextResponse.json({ ...result.updated, _meta: { cascadeCount: result.cascadeCount } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

  // Safety: pokud existují kameny/kazety co tu hodnotu drží, blokuj 409.
  // Klient musí poslat ?force=1 aby přepsal — kámen pak má orphan hodnotu
  // ("mimo aktivní seznam" v dropdownech). Doporučená alternativa je
  // PATCH active=false (soft hide) — kameny si hodnotu nechají, jen se
  // nezobrazuje v NOVÝCH dropdownech.
  const { searchParams } = new URL(_request.url);
  const force = searchParams.get('force') === '1';
  const usages = await countUsages(existing.attrKey, existing.value);
  if (usages > 0 && !force) {
    return NextResponse.json({
      error: `Tuto hodnotu drží ${usages} ${usages === 1 ? 'záznam' : usages < 5 ? 'záznamy' : 'záznamů'}. Smazáním vznikne orphan hodnota. Použij „Smazat i přesto" (force) nebo místo toho schovej přes Active toggle.`,
      usages,
      attrKey: existing.attrKey,
      value: existing.value,
    }, { status: 409 });
  }

  await prisma.attrOption.delete({ where: { id: optId } });
  await logActivity(
    session.id,
    'attr_option.delete',
    `${existing.attrKey}:${existing.value}`,
    JSON.stringify({ usages, forced: force }),
  );
  return NextResponse.json({ success: true, orphanedUsages: usages });
}
