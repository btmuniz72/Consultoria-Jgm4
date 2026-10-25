import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { currentRequestInfo, currentRole, currentUserId } from '../approvals/authority';
import { assertProjectOpen } from '../projects/project-guard';
import { TasksService } from '../tasks/tasks.service';
import { CommercialPhaseDto, ContractDto, DependencyDto, ProposalAcceptDto, ProposalDraftDto, ScheduleDto } from './commercial.dto';
import { acknowledgements, commercialAmounts, HO_RATE, IC_RATE, ollemPhases, parallelStages, terms } from './ollem-plan';
import { assertCommercialStart, lockCommercialProject } from './commercial-guard';

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const date = (value?: string) => value ? new Date(value) : null;
@Injectable()
export class CommercialService {
  constructor(private readonly prisma: PrismaService, private readonly tasks: TasksService) {}
  private async lock(tx: Tx, projectId: string) {
    const found = await lockCommercialProject(tx, projectId);
    if (!found.length) throw new NotFoundException('Projeto não encontrado.');
    await assertProjectOpen(tx, projectId);
  }
  private audit(tx: Tx, projectId: string, entityType: string, entityId: string, action: string, oldValue: unknown, newValue: unknown) {
    return tx.auditLog.create({ data: { projectId, entityType, entityId, action, userId: currentUserId(), actorType: currentRole(), oldValue: json(oldValue), newValue: json(newValue) } });
  }
  private async snapshot(db: Tx | PrismaService, projectId: string) {
    const project = await db.project.findUnique({ where: { id: projectId }, include: { company: { select: { name: true } }, phases: { where: { archived: false }, orderBy: { order: 'asc' }, include: { commercial: true, gate: { include: { criteria: { where: { archived: false }, orderBy: { order: 'asc' } } } }, tasks: { select: { id: true, code: true, title: true, objective: true, instructions: true, responsibilityType: true } } } } } });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    const phases = project.phases.map(p => {
      const c = p.commercial; const ho = p.order === 0 ? 0 : c?.homeOfficeHours?.toNumber() ?? null; const ic = p.order === 0 ? 0 : c?.inCompanyHours?.toNumber() ?? null;
      return { id: p.id, order: p.order, name: p.name, description: p.description, period: project.ollemRevision ? ollemPhases[p.order]?.period : 'Datas a definir', plannedStartDate: p.plannedStartDate, plannedEndDate: p.plannedEndDate,
        homeOfficeHours: ho, inCompanyHours: ic, ...commercialAmounts(p.order, ho, ic, c?.entryPercent.toNumber() ?? 100),
        entryPercent: c?.entryPercent.toNumber() ?? 100, dueDate: c?.dueDate ?? null, paymentCondition: c?.paymentCondition ?? 'Entrada na abertura da fase', blocking: c?.blocking ?? false,
        tasks: p.tasks, gate: p.gate ? { code: p.gate.code, question: p.gate.question, criteria: p.gate.criteria.map(x => x.description) } : null };
    });
    const configured = phases.every(p => p.configured);
    return { projectId, name: project.name, company: project.company.name, methodology: terms.methodology, terms, acknowledgements, parallelStages, homeOfficeRate: HO_RATE, inCompanyRate: IC_RATE,
      phases, configured, total: configured ? phases.reduce((sum, p) => sum + (p.total ?? 0), 0) : null };
  }
  async view(projectId: string) {
    const [preview, project, proposals, dependencies] = await Promise.all([
      this.snapshot(this.prisma, projectId),
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true, contractStatus: true, contractReference: true, startExceptionAt: true, startExceptionReason: true, ollemRevision: true } }),
      this.prisma.proposal.findMany({ where: { projectId }, orderBy: { version: 'desc' }, include: { comments: { orderBy: { createdAt: 'asc' } } } }),
      this.prisma.externalDependency.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const conditions = await this.prisma.phaseCommercial.findMany({ where: { phase: { projectId, archived: false } } });
    const userIds = [...new Set(proposals.flatMap(p => [p.approvedByUserId, ...p.comments.map(c => c.userId)]).filter((id): id is string => !!id))];
    const people = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const names = new Map(people.map(p => [p.id, p.name]));
    return { preview, project, proposals: proposals.map(p => ({ ...p, approvedByName: p.approvedByUserId ? names.get(p.approvedByUserId) ?? 'Usuário registrado' : null, comments: p.comments.map(c => ({ ...c, byName: names.get(c.userId) ?? 'Usuário registrado' })) })), dependencies, conditions };
  }
  async configurePhase(projectId: string, phaseId: string, dto: CommercialPhaseDto) {
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      const phase = await tx.phase.findFirst({ where: { id: phaseId, projectId, archived: false } });
      if (!phase) throw new NotFoundException('Fase não encontrada neste projeto.');
      if (phase.order === 0 && (dto.homeOfficeHours !== 0 || dto.inCompanyHours !== 0 || dto.blocking)) throw new BadRequestException('Fase 0 sem cobrança e sem bloqueio comercial.');
      if (dto.conditionMet && dto.blocking && !dto.conditionNote?.trim()) throw new BadRequestException('Registre a evidência da condição comercial atendida.');
      const old = await tx.phaseCommercial.findUnique({ where: { phaseId } });
      await tx.phaseCommercial.upsert({ where: { phaseId }, create: { ...dto, phaseId, dueDate: date(dto.dueDate) }, update: { ...dto, dueDate: date(dto.dueDate) } });
      await this.audit(tx, projectId, 'PhaseCommercial', phaseId, 'COMMERCIAL_PHASE_CONFIGURED', old, dto);
      // Pagamento nunca aprova Gate: apenas libera uma fase cujo Gate anterior JÁ está aprovado.
      const previous = await tx.gate.findFirst({ where: { projectId, phase: { order: phase.order - 1, archived: false }, status: 'APPROVED' } });
      if ((!dto.blocking || dto.conditionMet) && previous && ['LOCKED', 'BLOCKED'].includes(phase.status)) {
        await tx.phase.update({ where: { id: phaseId }, data: { status: 'AVAILABLE' } });
        await this.audit(tx, projectId, 'Phase', phaseId, 'PHASE_RELEASED', { status: phase.status }, { status: 'AVAILABLE', reason: 'TECHNICAL_GATE_ALREADY_APPROVED_AND_COMMERCIAL_CONDITION_MET' });
        await this.tasks.releaseAfterRequestChange(tx, projectId);
      }
    });
    return this.view(projectId);
  }
  async schedule(projectId: string, phaseId: string, dto: ScheduleDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      const old = await tx.phase.findFirst({ where: { id: phaseId, projectId, archived: false } });
      if (!old) throw new NotFoundException('Fase não encontrada.');
      if (dto.plannedStartDate && dto.plannedEndDate && dto.plannedStartDate > dto.plannedEndDate) throw new BadRequestException('Início deve preceder o término.');
      const updated = await tx.phase.update({ where: { id: phaseId }, data: { plannedStartDate: date(dto.plannedStartDate), plannedEndDate: date(dto.plannedEndDate) } });
      await this.audit(tx, projectId, 'Phase', phaseId, 'SCHEDULE_CONFIGURED', old, updated); return updated;
    });
  }
  async draft(projectId: string, dto: ProposalDraftDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      if (dto.validUntil && new Date(dto.validUntil) <= new Date()) throw new BadRequestException('Validade deve estar no futuro.');
      const previous = await tx.proposal.findFirst({ where: { projectId }, orderBy: { version: 'desc' } });
      const snapshot = await this.snapshot(tx, projectId);
      const proposal = await tx.proposal.create({ data: { projectId, version: (previous?.version ?? 0) + 1, notes: dto.notes, validUntil: date(dto.validUntil), snapshot: json(snapshot), contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') } });
      await this.audit(tx, projectId, 'Proposal', proposal.id, 'PROPOSAL_DRAFTED', null, { version: proposal.version, contentHash: proposal.contentHash }); return proposal;
    });
  }
  async transition(projectId: string, proposalId: string, action: 'send' | 'review' | 'reject' | 'accept', dto?: ProposalAcceptDto | { text: string }) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      const p = await tx.proposal.findFirst({ where: { id: proposalId, projectId } });
      if (!p) throw new NotFoundException('Proposta não encontrada neste projeto.');
      const latest = await tx.proposal.findFirst({ where: { projectId, status: { not: 'DRAFT' } }, orderBy: { version: 'desc' } });
      const snapshot = p.snapshot as any;
      let data: Prisma.ProposalUpdateInput;
      if (action === 'send') {
        if (p.status !== 'DRAFT' || !snapshot.configured) throw new ConflictException('Envio exige rascunho com horas comerciais configuradas em todas as fases.');
        const newest = await tx.proposal.findFirst({ where: { projectId }, orderBy: { version: 'desc' } });
        if (newest?.id !== p.id) throw new ConflictException('Envie a versão mais recente.');
        await tx.proposal.updateMany({ where: { projectId, id: { not: p.id }, status: { in: ['DRAFT', 'SENT', 'UNDER_REVIEW', 'APPROVED'] } }, data: { status: 'SUPERSEDED' } });
        data = { status: 'SENT', issuedAt: new Date() };
      } else {
        if (latest?.id !== p.id || !['SENT', 'UNDER_REVIEW'].includes(p.status)) throw new ConflictException('Esta versão não está disponível para decisão.');
        if (p.validUntil && p.validUntil < new Date()) throw new ConflictException('Proposta vencida; solicite nova versão.');
        data = { status: action === 'review' ? 'UNDER_REVIEW' : action === 'reject' ? 'REJECTED' : 'APPROVED' };
        if (action === 'accept') {
          if (!currentUserId() || currentRole() !== 'CLIENT_SPONSOR') throw new ForbiddenException('A validação exige patrocinador autenticado da Ollem.');
          const a = dto as ProposalAcceptDto;
          if (a.version !== p.version || a.contentHash !== p.contentHash || a.acknowledgements.length !== acknowledgements.length || a.acknowledgements.some(x => x !== true)) throw new BadRequestException('Confirme os cinco itens e a versão apresentada.');
          data = { ...data, approvedAt: new Date(), approvedByUserId: currentUserId(), acceptedIp: currentRequestInfo().ip ?? null, acceptedText: json({ snapshot: p.snapshot, acknowledgements, version: p.version, contentHash: p.contentHash }) };
        }
        if (action === 'reject') {
          const text = (dto as { text: string }).text;
          await tx.proposalComment.create({ data: { proposalId, userId: currentUserId()!, text } });
        }
      }
      const result = await tx.proposal.update({ where: { id: p.id }, data });
      await this.audit(tx, projectId, 'Proposal', p.id, `PROPOSAL_${action.toUpperCase()}`, { status: p.status }, { status: result.status, version: p.version, contentHash: p.contentHash, ...(action === 'accept' ? { acceptedText: result.acceptedText, ip: result.acceptedIp } : {}) });
      return result;
    });
  }
  async comment(projectId: string, proposalId: string, text: string) {
    if (!currentUserId()) throw new ForbiddenException('Usuário autenticado necessário.');
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      if (!await tx.proposal.findFirst({ where: { id: proposalId, projectId } })) throw new NotFoundException('Proposta não encontrada.');
      const c = await tx.proposalComment.create({ data: { proposalId, userId: currentUserId()!, text } });
      await this.audit(tx, projectId, 'Proposal', proposalId, 'PROPOSAL_QUESTION_RECORDED', null, { commentId: c.id, text }); return c;
    });
  }
  async contract(projectId: string, dto: ContractDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      const old = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      const p = await tx.project.update({ where: { id: projectId }, data: { contractStatus: dto.status, contractReference: dto.reference } });
      await this.audit(tx, projectId, 'Project', projectId, 'CONTRACT_STATUS_RECORDED', { status: old.contractStatus, reference: old.contractReference }, dto); return { contractStatus: p.contractStatus };
    });
  }
  async start(projectId: string, exception?: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      const old = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (exception !== undefined && exception.trim().length < 5) throw new BadRequestException('Informe a autorização formal da exceção.');
      if (!['PLANNED', 'PLANNING'].includes(old.status)) throw new ConflictException('Somente projeto em planejamento pode iniciar.');
      if (exception) {
        if (!currentUserId() || currentRole() !== 'JGM4_ADMIN') throw new ForbiddenException('Exceção exige administrador autenticado.');
        await tx.project.update({ where: { id: projectId }, data: { startExceptionReason: exception, startExceptionAt: new Date(), startExceptionByUserId: currentUserId() } });
        await this.audit(tx, projectId, 'Project', projectId, 'COMMERCIAL_START_EXCEPTION', null, { reason: exception });
      }
      await assertCommercialStart(tx, projectId);
      await tx.project.update({ where: { id: projectId }, data: { status: 'IN_PROGRESS', actualStartDate: new Date() } });
      await tx.projectStatusEvent.create({ data: { projectId, fromStatus: old.status, toStatus: 'IN_PROGRESS', reason: exception ?? 'Proposta aprovada e contrato assinado.', effectiveDate: new Date(), createdByUserId: currentUserId(), createdByRole: currentRole() } });
      await this.audit(tx, projectId, 'Project', projectId, 'COMMERCIAL_PROJECT_STARTED', { status: old.status }, { status: 'IN_PROGRESS', exception: exception ?? null }); return { status: 'IN_PROGRESS' };
    });
  }
  async dependency(projectId: string, dto: DependencyDto, dependencyId?: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      if (dto.blocksTask && !dto.taskId) throw new BadRequestException('Selecione a atividade bloqueada.');
      if (dto.taskId && !await tx.task.findFirst({ where: { id: dto.taskId, projectId } })) throw new BadRequestException('Atividade não pertence ao projeto.');
      const old = dependencyId ? await tx.externalDependency.findFirst({ where: { id: dependencyId, projectId } }) : null;
      if (dependencyId && !old) throw new NotFoundException('Dependência não encontrada.');
      const data = { ...dto, projectId, dueDate: date(dto.dueDate), taskId: dto.taskId ?? null };
      const d = old ? await tx.externalDependency.update({ where: { id: old.id }, data }) : await tx.externalDependency.create({ data });
      await this.audit(tx, projectId, 'ExternalDependency', d.id, old ? 'EXTERNAL_DEPENDENCY_UPDATED' : 'EXTERNAL_DEPENDENCY_CREATED', old, d); return d;
    });
  }
  async approveMovement(projectId: string, taskId: string, text: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, projectId);
      const task = await tx.task.findFirst({ where: { id: taskId, projectId, movementApprovalRequired: true } });
      if (!task) throw new NotFoundException('Movimentação não encontrada.');
      if (!currentUserId()) throw new ForbiddenException('Aceite exige usuário autenticado.');
      if (task.movementApprovedAt) throw new ConflictException('Aceite de movimentação já registrado.');
      const result = await tx.task.update({ where: { id: taskId }, data: { movementApprovedAt: new Date(), movementApprovedByUserId: currentUserId(), movementApprovalNote: text } });
      await this.audit(tx, projectId, 'Task', taskId, 'STRUCTURAL_MOVEMENT_ACCEPTED', null, { text, taskVersion: task.version, title: task.title, instructions: task.instructions, at: result.movementApprovedAt, userId: currentUserId() }); return { saved: true };
    });
  }
}
