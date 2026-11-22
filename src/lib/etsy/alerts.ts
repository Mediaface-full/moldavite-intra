/**
 * Upozornění na problémy s Etsy: záznam v ActivityLog (systémový uživatel „Etsy“) + e-mail všem adminům.
 * Lišta v intru čte nevyřešené konflikty z EtsyOrder a stav připojení z EtsyConnection.
 * Chyba e-mailu se jen zaloguje — upozornění nesmí shodit prodej ani frontu.
 */
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export type EtsyAlertKind = 'double_sale' | 'sold_with_reservation' | 'deactivate_failing' | 'disconnected' | 'order_canceled' | 'unknown_listing';
export interface EtsyAlertCtx { catalogNumber?: string; receiptId?: bigint | number; shopOrder?: string; note?: string }

export const ETSY_SYSTEM_EMAIL = 'etsy@system.bohemianmoldavite.local';
let cachedId: number | null = null;

/** Systémový uživatel „Etsy“ pro ActivityLog (nejde se pod ním přihlásit — viz lib/shop/systemUser.ts). */
export async function etsySystemUserId(): Promise<number> {
  if (cachedId !== null) return cachedId;
  const user = await prisma.user.upsert({
    where: { email: ETSY_SYSTEM_EMAIL },
    update: {},
    create: { email: ETSY_SYSTEM_EMAIL, password: bcrypt.hashSync(randomBytes(48).toString('hex'), 10), name: 'Etsy (systém)', role: 'USER' },
    select: { id: true },
  });
  cachedId = user.id;
  return cachedId;
}

export function alertText(kind: EtsyAlertKind, ctx: EtsyAlertCtx): { subject: string; text: string } {
  const k = ctx.catalogNumber ?? 'kámen';
  const etsy = ctx.receiptId !== undefined ? ` (Etsy objednávka ${ctx.receiptId})` : '';
  switch (kind) {
    case 'double_sale':
      return { subject: `Etsy: ${k} prodán dvakrát`, text: `${k} je zaplacen na Etsy${etsy} i jinde${ctx.shopOrder ? ` (e-shop objednávka ${ctx.shopOrder})` : ''}. Jednu objednávku zruš a vrať peníze.${ctx.note ? ` ${ctx.note}` : ''}` };
    case 'sold_with_reservation':
      return { subject: `Etsy: ${k} prodán, na e-shopu byl v košíku`, text: `${k} se prodal na Etsy${etsy}, zatímco ho měl zákazník e-shopu v košíku nebo v platbě. Zkontroluj, jestli e-shop objednávku nezaplatil.` };
    case 'deactivate_failing':
      return { subject: `Etsy: nejde stáhnout ${k}`, text: `${k} je v košíku nebo prodaný, ale listing na Etsy se nepodařilo stáhnout ani na třetí pokus.${ctx.note ? ` Důvod: ${ctx.note}` : ''} Stáhni ho ručně na Etsy.` };
    case 'disconnected':
      return { subject: 'Etsy: obchod odpojen', text: `Intra ztratila přístup k obchodu na Etsy${ctx.note ? ` (${ctx.note})` : ''}. Připoj ho znovu v Administraci → Etsy. Do té doby se nic nepropisuje.` };
    case 'unknown_listing':
      return { subject: 'Etsy: objednávka s neznámým listingem', text: `Etsy objednávka${etsy} obsahuje listing, který intra nezná${ctx.note ? ` (${ctx.note})` : ''}. Zkontroluj, o který kámen jde, a jestli není ještě v prodeji na e-shopu.` };
    case 'order_canceled':
      return { subject: `Etsy: zrušená objednávka${ctx.catalogNumber ? ` ${k}` : ''}`, text: `Objednávka na Etsy${etsy} byla zrušena. Kámen zůstává v intru prodaný — až se vrátí, vrať ho do prodeje ručně.` };
  }
}

export async function alertEtsy(kind: EtsyAlertKind, ctx: EtsyAlertCtx = {}): Promise<void> {
  const { subject, text } = alertText(kind, ctx);
  try {
    await logActivity(await etsySystemUserId(), `etsy.alert.${kind}`, ctx.catalogNumber ?? '', text);
  } catch (err) {
    console.error('[etsy] alert log selhal', err);
  }
  try {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } });
    for (const a of admins) {
      const r = await sendEmail({ to: a.email, subject, text, html: `<p>${text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</p>` });
      if (!r.ok) console.error('[etsy] e-mail upozornění neodešel', r.error);
    }
  } catch (err) {
    console.error('[etsy] e-mail upozornění selhal', err);
  }
}
