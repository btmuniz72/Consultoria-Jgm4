import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
type Db = Prisma.TransactionClient | PrismaService;
export const activeExternal = { notIn: ['COMPLETED', 'CANCELLED'] as ('COMPLETED' | 'CANCELLED')[] };
// O adapter qualifica consultas ORM, mas SQL bruto precisa respeitar o schema da conexão.
export function lockCommercialProject(db: Prisma.TransactionClient, projectId: string) {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public';
  const table = Prisma.raw(`"${schema.replaceAll('"', '""')}"."Project"`);
  return db.$queryRaw<{ id: string }[]>`SELECT id FROM ${table} WHERE id = ${projectId}::uuid FOR UPDATE`;
}

export async function assertCommercialStart(db: Db, projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.commercialControlEnabled) return;
  if (project.startExceptionAt && project.startExceptionByUserId && project.startExceptionReason) return;
  const approved = await db.proposal.findFirst({ where: { projectId, status: 'APPROVED' } });
  if (!approved || project.contractStatus !== 'SIGNED') throw new ConflictException('Início comercial exige proposta aprovada e contrato assinado ou exceção formal JGM4_ADMIN.');
}
export async function assertPhaseCommercial(db: Db, phaseId: string) {
  const commercial = await db.phaseCommercial.findUnique({ where: { phaseId } });
  if (commercial?.blocking && !commercial.conditionMet) throw new ConflictException('Condição comercial bloqueante da fase ainda não atendida. O Gate técnico permanece independente.');
}
export async function assertTaskExecution(db: Db, projectId: string, taskId: string, phaseId: string, order: number) {
  if (order > 0) { await assertCommercialStart(db, projectId); await assertPhaseCommercial(db, phaseId); }
  const external = await db.externalDependency.findFirst({ where: { projectId, status: activeExternal, OR: [{ blocksProject: true }, { blocksTask: true, taskId }] } });
  if (external) throw new ConflictException(`Dependência externa bloqueante: ${external.description}`);
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.movementApprovalRequired && !task.movementApprovedAt) throw new ConflictException('Movimentação estrutural exige aceite registrado da Ollem antes da execução.');
}
