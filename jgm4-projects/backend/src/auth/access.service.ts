import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActorUser, isJgm4Role } from '../approvals/authority';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
/** Administrador (e o ator de desenvolvimento) enxergam tudo; os demais, só projetos com vínculo ativo. */
export const hasGlobalAccess = (user: ActorUser) => user.dev === true || user.role === 'JGM4_ADMIN';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** `null` = todos os projetos; senão a lista de ids acessíveis (vínculo ativo + regra de empresa). */
  async accessibleProjectIds(user: ActorUser): Promise<string[] | null> {
    if (hasGlobalAccess(user)) return null;
    const memberships = await this.prisma.projectMembership.findMany({
      where: { userId: user.id!, active: true, project: { company: { active: true } } },
      select: { projectId: true, project: { select: { companyId: true } } },
    });
    return memberships.filter((item) => isJgm4Role(user.role) || (user.companyId !== null && item.project.companyId === user.companyId)).map((item) => item.projectId);
  }

  async canAccessProject(user: ActorUser, projectId: string) {
    if (hasGlobalAccess(user)) return true;
    const ids = await this.accessibleProjectIds(user);
    return !!ids?.includes(projectId);
  }

  async assertProject(user: ActorUser, projectId: string) {
    if (!(await this.canAccessProject(user, projectId))) throw new ForbiddenException('Você não tem acesso a este projeto.');
  }

  /** Projeto dono de uma entidade referenciada só pelo id (atividade, Gate, aprovação). `null` = não existe. */
  async projectOf(kind: 'task' | 'gate' | 'approval', id: string): Promise<string | null> {
    const select = { projectId: true } as const;
    const row = kind === 'task' ? await this.prisma.task.findUnique({ where: { id }, select })
      : kind === 'gate' ? await this.prisma.gate.findUnique({ where: { id }, select })
      : await this.prisma.approval.findUnique({ where: { id }, select });
    return row?.projectId ?? null;
  }
}
