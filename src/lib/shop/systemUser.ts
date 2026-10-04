/**
 * Systémový uživatel „E-shop" pro ActivityLog (ActivityLog.userId je povinný FK na User).
 *
 * Nelze se pod ním přihlásit: heslo je bcrypt hash náhodného tajemství (48 B), které se nikde
 * neukládá ani nevypisuje → bcrypt.compare v loginu vždy false (bez výjimky). Role USER. Vytvoří se při prvním zápisu z Shop API (upsert podle e-mailu).
 */
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const SHOP_SYSTEM_EMAIL = 'eshop@system.bohemianmoldavite.local';

let cachedId: number | null = null;

export async function shopSystemUserId(): Promise<number> {
  if (cachedId !== null) return cachedId;
  const user = await prisma.user.upsert({
    where: { email: SHOP_SYSTEM_EMAIL },
    update: {},
    create: {
      email: SHOP_SYSTEM_EMAIL,
      password: bcrypt.hashSync(randomBytes(48).toString('hex'), 10),
      name: 'E-shop (systém)',
      role: 'USER',
    },
    select: { id: true },
  });
  cachedId = user.id;
  return cachedId;
}
