import { hash } from 'bcryptjs';
import type { PrismaClient } from '../src/generated/prisma/client';

// Usuários e vínculos de DESENVOLVIMENTO. A senha local vem de SEED_USER_PASSWORD ou do padrão abaixo
// (documentado em docs/validacao-etapa-5-1.md). Em produção (NODE_ENV=production) o seed NÃO cria usuários
// sem SEED_USER_PASSWORD explícita e nunca usa a senha padrão.
export const DEV_PASSWORD = 'Jgm4-Dev-2026!';
const ollemCompany = '9f1ead00-1c44-4000-8000-000000000001'; const ollemProject = '9f1ead00-1c44-4000-8000-000000000002';
const demoCompany = '9f1ead00-1c44-4000-8000-0000000000d1'; const demoProjects = ['9f1ead00-1c44-4000-8000-0000000000d2', '9f1ead00-1c44-4000-8000-0000000000d3', '9f1ead00-1c44-4000-8000-0000000000d4', '9f1ead00-1c44-4000-8000-0000000000d5'];

const users = [
  { email: 'admin@jgm4.local', name: 'Administrador JGM4', role: 'JGM4_ADMIN', companyId: null, projects: [] as string[] },
  { email: 'consultor@jgm4.local', name: 'Consultor JGM4', role: 'JGM4_CONSULTANT', companyId: null, projects: [ollemProject, ...demoProjects] },
  { email: 'sponsor@ollem.local', name: 'Patrocinador Ollem', role: 'CLIENT_SPONSOR', companyId: ollemCompany, projects: [ollemProject] },
  { email: 'gestor@ollem.local', name: 'Gestor Almoxarifado', role: 'CLIENT_MANAGER', companyId: ollemCompany, projects: [ollemProject] },
  { email: 'operacao@ollem.local', name: 'Operação Ollem', role: 'CLIENT_USER', companyId: ollemCompany, projects: [ollemProject] },
  { email: 'sponsor@demo.ollem.local', name: 'Patrocinador (demonstração)', role: 'CLIENT_SPONSOR', companyId: demoCompany, projects: demoProjects },
  { email: 'gestor@demo.ollem.local', name: 'Gestor (demonstração)', role: 'CLIENT_MANAGER', companyId: demoCompany, projects: demoProjects },
] as const;

export async function seedUsers(prisma: PrismaClient) {
  const explicit = process.env.SEED_USER_PASSWORD;
  if (process.env.NODE_ENV === 'production' && !explicit) return { created: 0, skipped: true };
  const password = explicit ?? DEV_PASSWORD;
  const passwordHash = await hash(password, Math.max(4, Number(process.env.BCRYPT_COST) || 12));
  let created = 0;
  for (const item of users) {
    if (item.companyId && !await prisma.company.findUnique({ where: { id: item.companyId } })) continue;
    const existing = await prisma.user.findUnique({ where: { email: item.email } });
    // Nunca sobrescreve usuário existente (nem sua senha): reexecutar o seed é seguro.
    const user = existing ?? await prisma.user.create({ data: { email: item.email, name: item.name, role: item.role, companyId: item.companyId, passwordHash } });
    if (!existing) created++;
    for (const projectId of item.projects) {
      if (!await prisma.project.findUnique({ where: { id: projectId } })) continue;
      await prisma.projectMembership.upsert({ where: { projectId_userId: { projectId, userId: user.id } }, update: {}, create: { projectId, userId: user.id, roleInProject: item.role } });
    }
  }
  return { created, skipped: false };
}
