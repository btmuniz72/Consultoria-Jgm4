import { hash } from 'bcryptjs';
import { createClient } from './common';
import { validatePassword } from '../src/security/password-policy';

// Cria o PRIMEIRO administrador JGM4 de forma explícita (produção não usa seed de usuários):
//   ADMIN_EMAIL=... ADMIN_NAME="..." ADMIN_PASSWORD=... npm run admin:bootstrap
// A senha segue a política e deve ser trocada no primeiro acesso. Nada é impresso além do resultado. Idempotente.
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(); const name = process.env.ADMIN_NAME?.trim(); const password = process.env.ADMIN_PASSWORD;
  if (!email || !name || !password) throw new Error('Informe ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD.');
  const errors = validatePassword(password, { email, name }); if (errors.length) throw new Error(`ADMIN_PASSWORD fora da política: ${errors.join(' ')}`);
  const prisma = createClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) { console.log('Administrador já existe; nada foi alterado.'); return; }
    const admin = await prisma.user.create({ data: { email, name, role: 'JGM4_ADMIN', passwordHash: await hash(password, Math.max(10, Number(process.env.BCRYPT_COST) || 12)), mustChangePassword: true, passwordChangedAt: new Date() } });
    await prisma.securityEvent.create({ data: { type: 'USER_CREATED', userId: admin.id, metadata: { via: 'admin:bootstrap', role: 'JGM4_ADMIN' } } }); // registro administrativo da criação
    console.log(`Administrador ${email} criado. A senha deve ser trocada no primeiro acesso; configure a verificação em duas etapas.`);
  } finally { await prisma.$disconnect(); }
}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
