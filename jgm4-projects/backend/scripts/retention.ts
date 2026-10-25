import { createClient } from './common';
import { retentionConfig } from '../src/security/config';

// Retenção de dados (Etapa 8). Remove apenas dados operacionais de segurança vencidos; NUNCA toca AuditLog, aprovações, decisões, relatórios gerados,
// histórico de status ou evidências. IP/agente de eventos antigos são anonimizados (o evento permanece). Uso: npm run retention:run [-- --dry-run]
const DAY = 86400000;
export async function runRetention(dryRun: boolean, prisma = createClient()) {
  const cfg = retentionConfig(); const ago = (days: number) => new Date(Date.now() - days * DAY); const report: Record<string, number> = {};
  const step = async (name: string, counter: () => Promise<number>, deleter: () => Promise<{ count: number }>) => { report[name] = dryRun ? await counter() : (await deleter()).count; };
  const sessions = { OR: [{ expiresAt: { lt: ago(cfg.sessionDays) } }, { revokedAt: { lt: ago(cfg.sessionDays) } }] }; const tokens = { createdAt: { lt: ago(cfg.resetTokenDays) } };
  const buckets = { windowStart: { lt: ago(cfg.rateLimitDays) } }; const events = { createdAt: { lt: ago(cfg.securityEventDays) } };
  await step('sessoes_expiradas', () => prisma.authSession.count({ where: sessions }), () => prisma.authSession.deleteMany({ where: sessions }));
  await step('tokens_de_senha_vencidos', () => prisma.passwordResetToken.count({ where: tokens }), () => prisma.passwordResetToken.deleteMany({ where: tokens }));
  await step('contadores_de_rate_limit', () => prisma.rateLimitBucket.count({ where: buckets }), () => prisma.rateLimitBucket.deleteMany({ where: buckets }));
  await step('eventos_de_seguranca_vencidos', () => prisma.securityEvent.count({ where: events }), () => prisma.securityEvent.deleteMany({ where: events }));
  const stale = { createdAt: { lt: ago(cfg.ipAnonymizeDays) }, OR: [{ ip: { not: null } }, { userAgent: { not: null } }] };
  if (dryRun) report['ips_a_anonimizar'] = await prisma.securityEvent.count({ where: stale });
  else report['ips_anonimizados'] = await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('jgm4.retention', 'on', true)`; return (await tx.securityEvent.updateMany({ where: stale, data: { ip: null, userAgent: null } })).count; });
  return report;
}
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run'); const prisma = createClient();
  runRetention(dryRun, prisma).then((report) => console.log(`${dryRun ? '[simulação] ' : ''}Retenção: ${JSON.stringify(report)}`)).catch((error: Error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
