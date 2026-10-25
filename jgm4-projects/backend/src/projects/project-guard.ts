import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Projeto cancelado é somente consulta: nenhuma atividade, solicitação, Gate, aprovação ou apontamento
 * pode ser alterado. (Suspenso — ON_HOLD — continua operando; só o administrador controla o estado.)
 */
export async function assertProjectOpen(db: Prisma.TransactionClient | PrismaService, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (project?.status === 'CANCELLED') throw new ConflictException('Projeto cancelado: somente consulta. Nenhuma alteração é permitida.');
}
