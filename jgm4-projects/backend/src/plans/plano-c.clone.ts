import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PLAN_C_CODE } from '../templates/plano-c.template';
import { instantiateTemplate } from '../templates/templates.service';

/**
 * Compatibilidade (Etapa 10A): aplica a versão ATIVA do template PLAN_C. A estrutura deixou de ser fixa em código — vive em ProjectTemplate
 * (veja `templates/`). Novos fluxos usam `instantiateTemplate` com o template escolhido.
 */
export async function clonePlanC(tx: Prisma.TransactionClient, projectId: string, actor: { userId: string | null; role: string }) {
  const template = await tx.projectTemplate.findFirst({ where: { code: PLAN_C_CODE, status: 'ACTIVE' }, orderBy: { version: 'desc' }, select: { id: true } });
  if (!template) throw new ConflictException('O template Plano C não está ativo.');
  return instantiateTemplate(tx, projectId, template.id, actor);
}
