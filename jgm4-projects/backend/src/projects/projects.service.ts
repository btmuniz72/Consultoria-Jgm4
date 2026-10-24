import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  companies() {
    return this.prisma.company.findMany({
      where: { active: true }, select: { id: true, name: true, active: true }, orderBy: { name: 'asc' },
    });
  }
  projects(companyId?: string) {
    return this.prisma.project.findMany({
      where: { companyId, company: { active: true } }, orderBy: { name: 'asc' },
      select: { id: true, companyId: true, name: true, description: true, methodology: true, status: true,
        company: { select: { id: true, name: true } } },
    });
  }
  async project(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, company: { active: true } },
      include: {
        company: { select: { id: true, name: true } },
        phases: { orderBy: { order: 'asc' }, include: { gate: true } },
      },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    return {
      ...project,
      summary: {
        plannedWeeks: project.phases.reduce((sum, phase) => sum + phase.plannedWeeks, 0),
        plannedJgm4Hours: project.phases.reduce((sum, phase) => sum + phase.plannedJgm4Hours, 0),
        phaseCount: project.phases.length,
        gateCount: project.phases.filter((phase) => phase.gate !== null).length,
      },
    };
  }
  async phases(projectId: string) { return (await this.project(projectId)).phases; }
  async gates(projectId: string) {
    const phases = await this.phases(projectId);
    return phases.flatMap((phase) => phase.gate ? [{ ...phase.gate, phaseOrder: phase.order, phaseName: phase.name }] : []);
  }
  async tasks(projectId: string) {
    await this.project(projectId);
    const tasks = await this.prisma.task.findMany({
      where: { projectId }, orderBy: { code: 'asc' },
      select: { id: true, projectId: true, phaseId: true, code: true, title: true, objective: true,
        instructions: true, acceptanceCriteria: true, plannedJgm4Hours: true, plannedClientHours: true,
        status: true, responsibleUserId: true,
        requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { id: true, code: true, title: true, status: true } } },
    });
    return tasks.map(({ requests, ...task }) => ({ ...task, blockedByRequests: requests.length > 0, blockingRequests: requests }));
  }
}
