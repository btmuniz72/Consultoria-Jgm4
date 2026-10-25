import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, GateStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectOpen } from '../projects/project-guard';
import { ensureApproval, markInReview, resolveApprovals } from '../approvals/approval-sync';
import { can, currentRole, currentUserId, isJgm4Role } from '../approvals/authority';

type Db = Prisma.TransactionClient | PrismaService;
const isJgm4 = () => isJgm4Role(currentRole());
@Injectable()
export class GatesService {
  constructor(private readonly prisma: PrismaService) {}
  async transitionForGate(gateId: string, action: string, body: Record<string, any> = {}) {
    const gate = await this.prisma.gate.findUnique({ where: { id: gateId }, select: { projectId: true } });
    if (!gate) throw new NotFoundException('Gate não encontrado.');
    return this.transition(gate.projectId, gateId, action, body);
  }
  private async recalculate(db: Db, projectId: string, gateId: string) {
    const gate = await db.gate.findFirst({ where: { id: gateId, projectId }, include: { phase: true, criteria: { orderBy: { order: 'asc' } } } });
    if (!gate) throw new NotFoundException('Gate não encontrado neste projeto.');
    const tasks = await db.task.findMany({ where: { projectId, phaseId: gate.phaseId }, select: { status: true } });
    const requests = await db.projectRequest.findMany({ where: { projectId, phaseId: gate.phaseId, mandatory: true, blocking: true }, select: { status: true } });
    const tasksDone = tasks.length > 0 && tasks.every((task) => task.status === 'COMPLETED');
    const requestsDone = requests.every((request) => request.status === 'ACCEPTED');
    for (const criterion of gate.criteria) {
      if (criterion.sourceType !== 'TASK' && criterion.sourceType !== 'REQUEST') continue;
      const satisfied = criterion.sourceType === 'TASK' ? tasksDone : requestsDone;
      if (criterion.satisfied !== satisfied) await db.gateCriterion.update({ where: { id: criterion.id }, data: { satisfied, satisfiedAt: satisfied ? new Date() : null, satisfiedByUserId: null } });
    }
    const available = tasksDone && requestsDone;
    if (tasksDone && ['AVAILABLE', 'IN_PROGRESS'].includes(gate.phase.status)) {
      await db.phase.update({ where: { id: gate.phaseId }, data: { status: 'WAITING_GATE' } });
      await db.auditLog.create({ data: { projectId, entityType: 'Phase', entityId: gate.phaseId, action: 'PHASE_WAITING_GATE', actorType: 'SYSTEM', oldValue: { status: gate.phase.status }, newValue: { status: 'WAITING_GATE' } } });
    }
    if (gate.status === 'BLOCKED' && available) {
      await db.gate.update({ where: { id: gate.id }, data: { status: 'AVAILABLE', currentOwnerType: 'JGM4', nextAction: 'Iniciar análise do Gate.' } });
      await db.auditLog.create({ data: { projectId, entityType: 'Gate', entityId: gate.id, action: 'GATE_AVAILABLE', actorType: 'SYSTEM', oldValue: { status: 'BLOCKED' }, newValue: { status: 'AVAILABLE' } } });
      await this.ensureTechnicalOpinion(db, gate);
    }
    return gate;
  }
  private ensureTechnicalOpinion(db: Db, gate: { id: string; projectId: string; code: string; title: string; question: string; nextActionDueDate: Date | null }) {
    return ensureApproval(db, { projectId: gate.projectId, type: 'GATE_TECHNICAL_OPINION', entityType: 'Gate', entityId: gate.id, entityCode: gate.code,
      title: `${gate.code} — ${gate.title}`, description: gate.question, assignedRole: 'JGM4_CONSULTANT', priority: 'HIGH', dueAt: gate.nextActionDueDate });
  }
  // Central de Aprovações: acompanha cada passo do Gate (parecer técnico JGM4 → decisão Ollem).
  private async syncApprovals(tx: Prisma.TransactionClient, gate: { id: string; projectId: string; code: string; title: string; question: string; nextActionDueDate: Date | null }, action: string, body: Record<string, any>) {
    const technical = { entityType: 'Gate', entityId: gate.id, type: 'GATE_TECHNICAL_OPINION' as const };
    const client = { entityType: 'Gate', entityId: gate.id, type: 'GATE_CLIENT_DECISION' as const };
    switch (action) {
      case 'start-review':
      case 'resume-review':
        await this.ensureTechnicalOpinion(tx, gate); await markInReview(tx, technical.entityType, technical.entityId, technical.type); break;
      case 'request-correction':
        await resolveApprovals(tx, { ...technical, status: 'ADJUSTMENT_REQUESTED', comment: [body.correctionReason?.trim(), body.correctionInstructions?.trim()].filter(Boolean).join(' — ') }); break;
      case 'technical-opinion':
        if (body.technicalRecommendation === 'ADVANCE') {
          await resolveApprovals(tx, { ...technical, status: 'APPROVED', comment: body.technicalOpinion.trim() });
          await ensureApproval(tx, { projectId: gate.projectId, ...client, entityCode: gate.code, title: `${gate.code} — Decisão de avanço`, description: gate.question,
            assignedRole: 'CLIENT_SPONSOR', priority: 'HIGH', dueAt: gate.nextActionDueDate, requestedByRole: currentRole(), actorType: currentRole() });
        } else await resolveApprovals(tx, { ...technical, status: 'ADJUSTMENT_REQUESTED', comment: body.technicalOpinion.trim() });
        break;
      case 'client-decision':
        if (body.clientDecision === 'APPROVE') await resolveApprovals(tx, { ...client, status: 'APPROVED', comment: body.comment?.trim() || null });
        else if (body.clientDecision === 'REJECT') await resolveApprovals(tx, { ...client, status: 'REJECTED', comment: body.comment?.trim() || null });
        else await tx.auditLog.create({ data: { userId: currentUserId(), projectId: gate.projectId, entityType: 'Gate', entityId: gate.id, action: 'APPROVAL_ON_HOLD', actorType: currentRole(), newValue: { comment: body.comment?.trim() || null } } });
        break;
    }
  }
  async list(projectId: string) {
    const gates = await this.prisma.gate.findMany({ where: { projectId }, include: { phase: { select: { order: true, name: true, status: true } }, criteria: { orderBy: { order: 'asc' } } }, orderBy: { phase: { order: 'asc' } } });
    if (!gates.length) throw new NotFoundException('Projeto ou Gates não encontrados.');
    return Promise.all(gates.map(async gate => {
      await this.recalculate(this.prisma, projectId, gate.id);
      const refreshed = await this.prisma.gate.findUniqueOrThrow({ where: { id: gate.id }, include: { phase: { select: { order: true, name: true, status: true } }, criteria: { orderBy: { order: 'asc' } } } });
      return { ...await this.decorate(this.prisma, refreshed), phaseOrder: refreshed.phase.order, phaseName: refreshed.phase.name };
    }));
  }
  async detail(projectId: string, gateId: string) {
    await this.recalculate(this.prisma, projectId, gateId);
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, projectId }, include: {
      phase: { include: { tasks: { select: { id: true, code: true, title: true, status: true } } } },
      criteria: { orderBy: { order: 'asc' } },
    } });
    if (!gate) throw new NotFoundException('Gate não encontrado neste projeto.');
    const history = await this.prisma.auditLog.findMany({ where: { projectId, entityType: { in: ['Gate', 'Phase'] }, entityId: { in: [gate.id, gate.phaseId] } }, orderBy: { createdAt: 'asc' } });
    const requests = await this.prisma.projectRequest.findMany({ where: { projectId, phaseId: gate.phaseId, mandatory: true, blocking: true }, select: { id: true, code: true, title: true, status: true } });
    return { ...await this.decorate(this.prisma, gate), activities: gate.phase.tasks, requests, history };
  }
  private decorate(db: Db, gate: any) {
    return Promise.resolve({ ...gate, blockedReason: gate.status === 'BLOCKED' ? 'Atividades obrigatórias ou solicitações bloqueantes ainda pendentes.' : null,
      missingCriteria: gate.criteria.filter((c: any) => c.mandatory && !c.satisfied), localActor: isJgm4() ? 'JGM4_CONSULTANT' : 'CLIENT_SPONSOR', actorRole: currentRole(), canClientDecide: can(currentRole(), 'GATE_CLIENT_DECISION') });
  }
  private async releasePhaseTasks(tx: Prisma.TransactionClient, projectId: string, phaseId: string) {
    let released = true;
    while (released) {
      released = false;
      const tasks = await tx.task.findMany({ where: { projectId, phaseId, status: { in: ['BLOCKED', 'NOT_STARTED'] } }, include: {
        predecessor: { select: { status: true } }, gate: { select: { status: true } },
        requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { id: true } },
      } });
      for (const task of tasks) {
        if (task.requests.length || task.predecessor && task.predecessor.status !== 'COMPLETED' || task.gate && task.gate.status !== 'APPROVED') continue;
        const changed = await tx.task.updateMany({ where: { id: task.id, status: task.status }, data: { status: 'RELEASED', currentOwnerType: task.responsibilityType === 'JGM4' ? 'JGM4' : 'CLIENT', nextAction: 'Iniciar a atividade liberada.', version: { increment: 1 } } });
        if (!changed.count) continue;
        await tx.auditLog.create({ data: { projectId, entityType: 'Task', entityId: task.id, action: 'RELEASED', actorType: 'SYSTEM', oldValue: { status: task.status }, newValue: { status: 'RELEASED', reason: 'GATE_APPROVED' } } });
        released = true;
      }
    }
  }
  async transition(projectId: string, gateId: string, action: string, body: Record<string, any> = {}) {
    await this.prisma.$transaction(async tx => {
      await assertProjectOpen(tx, projectId);
      await this.recalculate(tx, projectId, gateId);
      const gate = await tx.gate.findFirst({ where: { id: gateId, projectId }, include: { phase: true, criteria: true } });
      if (!gate) throw new NotFoundException('Gate não encontrado neste projeto.');
      const role = currentRole();
      const log = async (to: GateStatus | null, oldExtra = {}, newExtra = {}) => tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Gate', entityId: gateId, action: action.toUpperCase().replaceAll('-', '_'), actorType: role, oldValue: { status: gate.status, ...oldExtra }, newValue: { status: to ?? gate.status, ...newExtra } } });
      let status: GateStatus = gate.status; let owner = gate.currentOwnerType; let next = gate.nextAction;
      switch (action) {
        case 'start-review':
          if (!isJgm4()) throw new ForbiddenException('Somente JGM4 pode iniciar a análise técnica.');
          if (gate.status !== 'AVAILABLE') throw new ConflictException('O Gate precisa estar disponível para iniciar a análise.');
          status = 'UNDER_REVIEW'; owner = 'JGM4'; next = 'Avaliar critérios e emitir parecer técnico.'; break;
        case 'request-correction':
          if (!isJgm4()) throw new ForbiddenException('Somente JGM4 pode solicitar correções.');
          if (gate.status !== 'UNDER_REVIEW' || !body.correctionReason?.trim() || !body.correctionInstructions?.trim()) throw new BadRequestException('Informe o motivo e as instruções da correção durante uma análise.');
          status = 'CORRECTION_REQUIRED'; owner = 'CLIENT'; next = body.correctionInstructions.trim(); break;
        case 'resume-review':
          if (!isJgm4()) throw new ForbiddenException('Somente JGM4 pode retomar a análise.');
          if (gate.status !== 'CORRECTION_REQUIRED') throw new ConflictException('Somente um Gate com correção solicitada pode ser retomado.');
          status = 'UNDER_REVIEW'; owner = 'JGM4'; next = 'Reavaliar correções e critérios.'; break;
        case 'criterion': {
          if (!isJgm4()) throw new ForbiddenException('Somente JGM4 pode validar critérios técnicos.');
          if (!['UNDER_REVIEW', 'CORRECTION_REQUIRED'].includes(gate.status)) throw new ConflictException('Critérios só podem ser avaliados durante a análise do Gate.');
          const criterion = gate.criteria.find((c) => c.id === body.criterionId);
          if (!criterion) throw new NotFoundException('Critério não encontrado neste Gate.');
          if (criterion.sourceType === 'TASK' || criterion.sourceType === 'REQUEST') throw new BadRequestException('Este critério é calculado automaticamente pelo sistema.');
          if (body.satisfied && criterion.evidenceRequired && !body.evidenceReference?.trim()) throw new BadRequestException('Informe a referência da evidência obrigatória.');
          await tx.gateCriterion.update({ where: { id: criterion.id }, data: { satisfied: !!body.satisfied, satisfiedAt: body.satisfied ? new Date() : null, satisfiedByUserId: currentUserId(), evidenceReference: body.evidenceReference?.trim() || null } });
          await log(null, { criterionId: criterion.id, satisfied: criterion.satisfied }, { criterionId: criterion.id, satisfied: !!body.satisfied, evidenceReference: body.evidenceReference?.trim() || null });
          return { saved: true };
        }
        case 'technical-opinion':
          if (!isJgm4()) throw new ForbiddenException('Somente JGM4 pode emitir parecer técnico.');
          if (gate.status !== 'UNDER_REVIEW') throw new ConflictException('O Gate precisa estar em análise.');
          if (!body.technicalOpinion?.trim() || !['ADVANCE', 'DO_NOT_ADVANCE'].includes(body.technicalRecommendation)) throw new BadRequestException('Informe o parecer e a recomendação técnica.');
          if (body.technicalRecommendation === 'ADVANCE' && gate.criteria.some(c => c.mandatory && !c.satisfied)) throw new ConflictException('Parecer favorável bloqueado: há critérios obrigatórios pendentes.');
          status = body.technicalRecommendation === 'ADVANCE' ? 'TECHNICALLY_APPROVED' : 'CORRECTION_REQUIRED'; owner = body.technicalRecommendation === 'ADVANCE' ? 'CLIENT_SPONSOR' : 'CLIENT'; next = body.technicalRecommendation === 'ADVANCE' ? 'Patrocinador Ollem: confirmar a decisão de avanço.' : 'Tratar as correções solicitadas pela JGM4.';
          await tx.gate.update({ where: { id: gateId }, data: { status, technicalRecommendation: body.technicalRecommendation, technicalOpinion: body.technicalOpinion.trim(), technicalApprovedAt: status === 'TECHNICALLY_APPROVED' ? new Date() : null, technicalApprovedByUserId: status === 'TECHNICALLY_APPROVED' ? currentUserId() : null, currentOwnerType: owner, nextAction: next } });
          await log(status, {}, { technicalRecommendation: body.technicalRecommendation, technicalOpinion: body.technicalOpinion.trim() });
          await this.syncApprovals(tx, gate, action, body);
          return { saved: true };
        case 'client-decision':
          if (!can(currentRole(), 'GATE_CLIENT_DECISION')) throw new ForbiddenException('Somente o patrocinador Ollem pode tomar a decisão empresarial.');
          if (gate.status !== 'TECHNICALLY_APPROVED') throw new ConflictException('A decisão Ollem exige parecer técnico favorável da JGM4.');
          if (!['APPROVE', 'HOLD', 'REJECT'].includes(body.clientDecision)) throw new BadRequestException('Decisão inválida.');
          if (body.clientDecision === 'APPROVE') {
            status = 'APPROVED'; owner = 'SYSTEM'; next = 'Gate aprovado; fase seguinte liberada.';
            const nextPhase = await tx.phase.findFirst({ where: { projectId, order: gate.phase.order + 1 } });
            await tx.phase.update({ where: { id: gate.phaseId }, data: { status: 'COMPLETED', actualEndDate: new Date() } });
            await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Phase', entityId: gate.phaseId, action: 'PHASE_COMPLETED', actorType: role, oldValue: { status: gate.phase.status }, newValue: { status: 'COMPLETED' } } });
            if (nextPhase) {
              await tx.phase.update({ where: { id: nextPhase.id }, data: { status: 'AVAILABLE' } });
              await tx.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'Phase', entityId: nextPhase.id, action: 'PHASE_RELEASED', actorType: role, oldValue: { status: nextPhase.status }, newValue: { status: 'AVAILABLE' } } });
            } else await tx.project.update({ where: { id: projectId }, data: { status: 'IMPLEMENTATION_COMPLETED', actualEndDate: new Date() } });
          } else if (body.clientDecision === 'HOLD') { status = 'TECHNICALLY_APPROVED'; owner = 'CLIENT_SPONSOR'; next = 'Decisão de avanço em espera.'; }
          else { status = 'REJECTED'; owner = 'SYSTEM'; next = 'Gate rejeitado; projeto não avançará para a próxima fase.'; }
          await tx.gate.update({ where: { id: gateId }, data: { status, clientDecision: body.clientDecision, clientDecisionComment: body.comment?.trim() || null, clientDecisionAt: new Date(), clientDecisionByUserId: currentUserId(), currentOwnerType: owner, nextAction: next } });
          if (body.clientDecision === 'APPROVE') await this.releasePhaseTasks(tx, projectId, gate.phase.order < 4
            ? (await tx.phase.findFirstOrThrow({ where: { projectId, order: gate.phase.order + 1 } })).id
            : gate.phaseId);
          await log(status, {}, { clientDecision: body.clientDecision, comment: body.comment?.trim() || null });
          await this.syncApprovals(tx, gate, action, body);
          return { saved: true };
        default: throw new BadRequestException('Ação de Gate desconhecida.');
      }
      await tx.gate.update({ where: { id: gateId }, data: { status, currentOwnerType: owner, nextAction: next, correctionReason: action === 'request-correction' ? body.correctionReason.trim() : gate.correctionReason, correctionInstructions: action === 'request-correction' ? body.correctionInstructions.trim() : gate.correctionInstructions } });
      await log(status, {}, action === 'request-correction' ? { correctionReason: body.correctionReason.trim(), correctionInstructions: body.correctionInstructions.trim() } : {});
      await this.syncApprovals(tx, gate, action, body);
      return { saved: true };
    });
    return this.detail(projectId, gateId);
  }
  async syncProject(tx: Db, projectId: string) {
    const gates = await tx.gate.findMany({ where: { projectId }, select: { id: true } });
    for (const gate of gates) await this.recalculate(tx, projectId, gate.id);
  }
}
