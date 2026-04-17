import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const email = process.env.ADMIN_EMAIL || 'admin@moldavite.cz';
const password = process.env.ADMIN_PASSWORD;

if (!password) {
  console.log('[init-admin] ADMIN_PASSWORD not set — nothing to do.');
  process.exit(0);
}
if (password.length < 12) {
  console.error('[init-admin] ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[init-admin] Admin already exists (${email}) — password left unchanged.`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, password: hash, name: 'Admin', role: 'ADMIN' },
    });
    console.log(`[init-admin] Created admin user: ${email}`);
  }
} catch (err) {
  console.error('[init-admin] Failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
