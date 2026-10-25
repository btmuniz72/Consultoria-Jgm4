import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { currentRole, currentUserId } from '../approvals/authority';
import { Prisma } from '../generated/prisma/client';
import { ITEM_KINDS, PARENT_FIELD, parseItem, validateTemplateTree } from './template-structure';
import { PLAN_C_CODE, ensurePlanCTemplate } from './plano-c.template';

export class CreateTemplateDto {
  @IsString() @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'O código deve ter 2 a 40 caracteres: letras maiúsculas, números e _.' }) code!: string;
  @IsString() @MinLength(3) @MaxLength(160) name!: string;
  @IsString() @MinLength(3) @MaxLength(3000) description!: string;
}
export class PatchTemplateDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3000) description?: string;
}
export class ActivateTemplateDto { @IsOptional() @IsBoolean() inactivatePrevious?: boolean }

const treeInclude = {
  phases: { orderBy: { order: 'asc' as const } },
  tasks: { orderBy: [{ order: 'asc' as const }, { code: 'asc' as const }], include: { checklist: { orderBy: { order: 'asc' as const } } } },
  gates: { include: { criteria: { orderBy: { order: 'asc' as const } } } },
  requests: { orderBy: [{ order: 'asc' as const }, { code: 'asc' as const }], include: { requirements: { orderBy: { order: 'asc' as const } } } },
  dependencies: true,
};

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/**
 * Templates reutilizáveis de projetos. O template NUNCA é referenciado pelas tabelas de execução (apenas uma referência histórica no Project);
 * projetos recebem cópia independente e não mudam quando o template muda.
 */
@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger('Templates');
  constructor(private readonly prisma: PrismaService) {}

  /** Registra o Plano C v1 se ainda não existir (idempotente; a aplicação não depende do seed). */
  async onModuleInit() {
    if (process.env.TEMPLATES_AUTOLOAD === 'false') return;
    try { const result = await ensurePlanCTemplate(this.prisma); if (result.created) this.logger.log('Template PLAN_C v1 registrado.'); }
    catch (error) { this.logger.warn(`Template PLAN_C não registrado agora: ${(error as Error).message.slice(0, 120)}`); }
  }

  private audit(db: Prisma.TransactionClient | PrismaService, templateId: string, action: string, extra: { old?: Prisma.InputJsonValue; value?: Prisma.InputJsonValue } = {}) {
    return db.auditLog.create({ data: { projectId: null, entityType: 'ProjectTemplate', entityId: templateId, action, userId: currentUserId(), actorType: currentRole(), oldValue: extra.old, newValue: extra.value } });
  }
  private async get(id: string) { const template = await this.prisma.projectTemplate.findUnique({ where: { id } }); if (!template) throw new NotFoundException('Template não encontrado.'); return template; }
  private assertDraft(status: string) { if (status !== 'DRAFT') throw new ConflictException('Somente templates em rascunho (DRAFT) têm a estrutura editável. Crie uma nova versão para alterar.'); }

  // ---------------------------------------------------------------- consulta
  private present(template: { id: string; code: string; name: string; description: string; version: number; status: string; methodology: string; updatedAt: Date; createdAt: Date; validatedAt: Date | null; _count?: { phases: number; tasks: number; gates: number; requests: number; projects: number } }) {
    return { id: template.id, code: template.code, name: template.name, description: template.description, version: template.version, status: template.status, updatedAt: template.updatedAt, createdAt: template.createdAt, validatedAt: template.validatedAt,
      phases: template._count?.phases ?? 0, tasks: template._count?.tasks ?? 0, gates: template._count?.gates ?? 0, requests: template._count?.requests ?? 0, projects: template._count?.projects ?? 0 };
  }
  async list(status?: string) {
    const rows = await this.prisma.projectTemplate.findMany({ where: status ? { status: status as never } : {}, orderBy: [{ code: 'asc' }, { version: 'desc' }], include: { _count: { select: { phases: true, tasks: true, gates: true, requests: true, projects: true } } } });
    return rows.map((row) => this.present(row));
  }
  /** Modelos disponíveis para NOVOS projetos (somente ACTIVE). */
  active() { return this.list('ACTIVE'); }
  async detail(id: string) {
    const template = await this.prisma.projectTemplate.findUnique({ where: { id }, include: { ...treeInclude, _count: { select: { phases: true, tasks: true, gates: true, requests: true, projects: true } } } });
    if (!template) throw new NotFoundException('Template não encontrado.');
    return { ...this.present(template), phaseList: template.phases, taskList: template.tasks, gateList: template.gates, requestList: template.requests, dependencyList: template.dependencies };
  }
  /** Estrutura em árvore (fase → atividades, solicitações, Gate) sem criar projeto. */
  async preview(id: string) {
    const template = await this.prisma.projectTemplate.findUnique({ where: { id }, include: treeInclude }); if (!template) throw new NotFoundException('Template não encontrado.');
    const hours = (value: unknown) => Number(value ?? 0);
    return { id: template.id, code: template.code, name: template.name, version: template.version, status: template.status,
      phases: template.phases.map((phase) => ({ order: phase.order, name: phase.name, plannedWeeks: phase.plannedWeeks, jgm4Hours: phase.plannedJgm4Hours,
        clientHours: template.tasks.filter((task) => task.phaseId === phase.id).reduce((total, task) => total + hours(task.plannedClientHours), 0),
        tasks: template.tasks.filter((task) => task.phaseId === phase.id).map((task) => ({ code: task.code, title: task.title, jgm4Hours: hours(task.plannedJgm4Hours), clientHours: hours(task.plannedClientHours), checklist: task.checklist.length,
          after: template.dependencies.find((d) => d.kind === 'TASK_AFTER_TASK' && d.fromCode === task.code)?.toCode ?? null })),
        requests: template.requests.filter((request) => request.phaseId === phase.id).map((request) => ({ code: request.code, title: request.title, blocking: request.blocking, requirements: request.requirements.length })),
        gate: template.gates.filter((gate) => gate.phaseId === phase.id).map((gate) => ({ code: gate.code, title: gate.title, question: gate.question, criteria: gate.criteria.length }))[0] ?? null })),
      totals: { phases: template.phases.length, tasks: template.tasks.length, requests: template.requests.length, gates: template.gates.length, jgm4Hours: template.tasks.reduce((t, task) => t + hours(task.plannedJgm4Hours), 0), clientHours: template.tasks.reduce((t, task) => t + hours(task.plannedClientHours), 0) } };
  }

  // ---------------------------------------------------------------- ciclo de vida
  async create(dto: CreateTemplateDto) {
    if (await this.prisma.projectTemplate.findFirst({ where: { code: dto.code } })) throw new ConflictException('Já existe um template com este código; use "Criar nova versão".');
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectTemplate.create({ data: { code: dto.code, name: dto.name.trim(), description: dto.description.trim(), methodology: dto.code, status: 'DRAFT', version: 1, createdByUserId: currentUserId() } });
      await this.audit(tx, created.id, 'TEMPLATE_CREATED', { value: { code: created.code, version: 1, status: 'DRAFT' } }); return created;
    });
    return this.detail(template.id);
  }
  async patch(id: string, dto: PatchTemplateDto) {
    const template = await this.get(id); if (template.status === 'ARCHIVED') throw new ConflictException('Template arquivado não pode ser alterado.');
    const data = { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.description ? { description: dto.description.trim() } : {}) }; if (!Object.keys(data).length) throw new BadRequestException('Nada a alterar.');
    await this.prisma.$transaction(async (tx) => { await tx.projectTemplate.update({ where: { id }, data: { ...data, validatedAt: template.status === 'DRAFT' ? null : template.validatedAt } }); await this.audit(tx, id, 'TEMPLATE_UPDATED', { old: { name: template.name, description: template.description }, value: data }); });
    return this.detail(id);
  }
  async validate(id: string) {
    const tree = await this.prisma.projectTemplate.findUnique({ where: { id }, include: treeInclude }); if (!tree) throw new NotFoundException('Template não encontrado.');
    const result = validateTemplateTree(tree as never);
    await this.prisma.$transaction(async (tx) => { if (tree.status === 'DRAFT') await tx.projectTemplate.update({ where: { id }, data: { validatedAt: result.errors.length ? null : new Date() } }); await this.audit(tx, id, 'TEMPLATE_VALIDATED', { value: { errors: result.errors.length, warnings: result.warnings.length } }); });
    return { id, valid: result.errors.length === 0, ...result };
  }
  async activate(id: string, dto: ActivateTemplateDto) {
    const template = await this.get(id); if (template.status !== 'DRAFT') throw new ConflictException('Somente rascunhos são ativados (use "Reativar" para templates inativos).');
    const validation = await this.validate(id);
    if (!validation.valid) throw new ConflictException({ message: ['O template possui erros e não pode ser ativado.', ...validation.errors], error: 'Conflict', statusCode: 409 });
    const previous = dto.inactivatePrevious ? await this.prisma.projectTemplate.findMany({ where: { code: template.code, status: 'ACTIVE', id: { not: id } }, select: { id: true, version: true } }) : [];
    await this.prisma.$transaction(async (tx) => {
      await tx.projectTemplate.update({ where: { id }, data: { status: 'ACTIVE' } });
      await this.audit(tx, id, 'TEMPLATE_ACTIVATED', { old: { status: 'DRAFT' }, value: { status: 'ACTIVE', inactivatedPrevious: previous.map((p) => p.version) } });
      for (const item of previous) { await tx.projectTemplate.update({ where: { id: item.id }, data: { status: 'INACTIVE' } }); await this.audit(tx, item.id, 'TEMPLATE_INACTIVATED', { old: { status: 'ACTIVE' }, value: { status: 'INACTIVE', reason: `versão ${template.version} ativada` } }); }
    });
    return this.detail(id);
  }
  async setStatus(id: string, to: 'INACTIVE' | 'ACTIVE' | 'ARCHIVED') {
    const template = await this.get(id);
    const allowed: Record<string, string[]> = { INACTIVE: ['ACTIVE'], ACTIVE: ['INACTIVE'], ARCHIVED: ['DRAFT', 'ACTIVE', 'INACTIVE'] };
    if (!allowed[to].includes(template.status)) throw new ConflictException(`Transição não permitida: ${template.status} → ${to}.`);
    if (to === 'ACTIVE' && !template.validatedAt) throw new ConflictException('Valide o template antes de reativá-lo.');
    await this.prisma.$transaction(async (tx) => { await tx.projectTemplate.update({ where: { id }, data: { status: to } }); await this.audit(tx, id, to === 'ARCHIVED' ? 'TEMPLATE_ARCHIVED' : to === 'INACTIVE' ? 'TEMPLATE_INACTIVATED' : 'TEMPLATE_ACTIVATED', { old: { status: template.status }, value: { status: to } }); });
    return this.detail(id);
  }
  /** Copia a estrutura de qualquer versão (não DRAFT) para um novo rascunho com versão + 1. Projetos não são copiados nem alterados. */
  async newVersion(id: string) {
    const source = await this.prisma.projectTemplate.findUnique({ where: { id }, include: treeInclude }); if (!source) throw new NotFoundException('Template não encontrado.');
    if (source.status === 'DRAFT') throw new ConflictException('Este template já é um rascunho.');
    if (source.status === 'ARCHIVED') throw new ConflictException('Template arquivado não gera novas versões.');
    if (await this.prisma.projectTemplate.findFirst({ where: { code: source.code, status: 'DRAFT' } })) throw new ConflictException('Já existe um rascunho deste template; conclua-o antes de criar outra versão.');
    const latest = await this.prisma.projectTemplate.aggregate({ where: { code: source.code }, _max: { version: true } });
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.projectTemplate.create({ data: { code: source.code, name: source.name, description: source.description, methodology: source.methodology, version: (latest._max.version ?? source.version) + 1, status: 'DRAFT', createdByUserId: currentUserId() } });
      const phaseIds = new Map<string, string>();
      for (const phase of source.phases) phaseIds.set(phase.id, (await tx.templatePhase.create({ data: { templateId: draft.id, order: phase.order, name: phase.name, description: phase.description, plannedWeeks: phase.plannedWeeks, plannedJgm4Hours: phase.plannedJgm4Hours, plannedClientHours: phase.plannedClientHours } })).id);
      for (const gate of source.gates) {
        const copy = await tx.templateGate.create({ data: { templateId: draft.id, phaseId: phaseIds.get(gate.phaseId)!, code: gate.code, title: gate.title, question: gate.question, description: gate.description } });
        for (const criterion of gate.criteria) await tx.templateGateCriterion.create({ data: { gateId: copy.id, code: criterion.code, description: criterion.description, mandatory: criterion.mandatory, evidenceRequired: criterion.evidenceRequired, sourceType: criterion.sourceType, order: criterion.order } });
      }
      for (const task of source.tasks) {
        const copy = await tx.templateTask.create({ data: { templateId: draft.id, phaseId: phaseIds.get(task.phaseId)!, code: task.code, title: task.title, description: task.description, objective: task.objective, instructions: task.instructions, acceptanceCriteria: task.acceptanceCriteria,
          responsibilityType: task.responsibilityType, priority: task.priority, plannedJgm4Hours: task.plannedJgm4Hours, plannedClientHours: task.plannedClientHours, order: task.order } });
        for (const item of task.checklist) await tx.templateChecklistItem.create({ data: { taskId: copy.id, label: item.label, required: item.required, order: item.order } });
      }
      for (const request of source.requests) {
        const copy = await tx.templateRequest.create({ data: { templateId: draft.id, phaseId: phaseIds.get(request.phaseId)!, code: request.code, title: request.title, description: request.description, instructions: request.instructions, acceptanceCriteria: request.acceptanceCriteria,
          blocking: request.blocking, mandatory: request.mandatory, relativeDueDays: request.relativeDueDays, order: request.order } });
        for (const item of request.requirements) await tx.templateRequestRequirement.create({ data: { requestId: copy.id, label: item.label, required: item.required, order: item.order } });
      }
      for (const dependency of source.dependencies) await tx.templateDependency.create({ data: { templateId: draft.id, kind: dependency.kind, fromCode: dependency.fromCode, toCode: dependency.toCode } });
      await this.audit(tx, draft.id, 'TEMPLATE_VERSION_CREATED', { value: { code: draft.code, fromVersion: source.version, version: draft.version } });
      return draft;
    }, { timeout: 60000 });
    return this.detail(created.id);
  }

  // ---------------------------------------------------------------- edição da estrutura (somente DRAFT)
  private async scope(templateId: string, kind: string, body: Record<string, unknown>) {
    const spec = ITEM_KINDS[kind]; if (!spec) throw new NotFoundException('Tipo de item desconhecido.');
    const template = await this.get(templateId); this.assertDraft(template.status);
    const parentField = spec.parent === 'template' ? null : PARENT_FIELD[spec.parent];
    if (parentField && typeof body[parentField] === 'string') {
      const parentDelegate = { gate: 'templateGate', task: 'templateTask', request: 'templateRequest' }[spec.parent as 'gate' | 'task' | 'request'];
      const parent = await (this.prisma as never as Record<string, { findFirst: (a: object) => Promise<unknown> }>)[parentDelegate].findFirst({ where: { id: body[parentField], templateId } });
      if (!parent) throw new BadRequestException('Item pai não pertence a este template.');
    }
    if (typeof body['phaseId'] === 'string' && 'phaseId' in spec.fields && !(await this.prisma.templatePhase.findFirst({ where: { id: body['phaseId'] as string, templateId } }))) throw new BadRequestException('Fase não pertence a este template.');
    return { spec, template, parentField };
  }
  private async touch(templateId: string, action: string, value: Prisma.InputJsonValue) {
    await this.prisma.projectTemplate.update({ where: { id: templateId }, data: { validatedAt: null } }); await this.audit(this.prisma, templateId, 'TEMPLATE_UPDATED', { value: { action, ...(value as object) } });
  }
  private dbError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) { if (error.code === 'P2002') throw new ConflictException('Já existe um item com este código/ordem neste template.'); if (error.code === 'P2003' || error.code === 'P2025') throw new BadRequestException('Referência inválida.'); }
    throw error;
  }
  async addItem(templateId: string, kind: string, body: Record<string, unknown>) {
    const { spec, parentField } = await this.scope(templateId, kind, body);
    const data = parseItem(kind, body, false);
    if (parentField) { if (typeof body[parentField] !== 'string') throw new BadRequestException(`Campo obrigatório: ${parentField}.`); data[parentField] = body[parentField]; } else data['templateId'] = templateId;
    if (spec.parent === 'template') data['templateId'] = templateId;
    try {
      const row = await (this.prisma as never as Record<string, { create: (a: object) => Promise<{ id: string }> }>)[spec.delegate].create({ data });
      await this.touch(templateId, `add:${kind}`, { itemId: row.id }); return row;
    } catch (error) { return this.dbError(error); }
  }
  async updateItem(templateId: string, kind: string, itemId: string, body: Record<string, unknown>) {
    const { spec } = await this.scope(templateId, kind, body);
    const data = parseItem(kind, body, true); if (!Object.keys(data).length) throw new BadRequestException('Nada a alterar.');
    const delegate = (this.prisma as never as Record<string, { findFirst: (a: object) => Promise<unknown>; update: (a: object) => Promise<{ id: string }> }>)[spec.delegate];
    if (!(await delegate.findFirst({ where: { id: itemId, ...(spec.parent === 'template' ? { templateId } : {}) } }))) throw new NotFoundException('Item não encontrado.');
    await this.assertOwned(templateId, kind, itemId);
    try { const row = await delegate.update({ where: { id: itemId }, data }); await this.touch(templateId, `update:${kind}`, { itemId }); return row; } catch (error) { return this.dbError(error); }
  }
  async removeItem(templateId: string, kind: string, itemId: string) {
    const { spec } = await this.scope(templateId, kind, {});
    await this.assertOwned(templateId, kind, itemId);
    const delegate = (this.prisma as never as Record<string, { delete: (a: object) => Promise<unknown> }>)[spec.delegate];
    try { await delegate.delete({ where: { id: itemId } }); await this.touch(templateId, `remove:${kind}`, { itemId }); return { id: itemId, removed: true }; } catch (error) { return this.dbError(error); }
  }
  /** O item precisa pertencer ao template informado (diretamente ou pela cadeia de pais). */
  private async assertOwned(templateId: string, kind: string, itemId: string) {
    const checks: Record<string, object> = {
      phases: { templatePhase: { id: itemId, templateId } }, gates: { templateGate: { id: itemId, templateId } }, tasks: { templateTask: { id: itemId, templateId } }, requests: { templateRequest: { id: itemId, templateId } }, dependencies: { templateDependency: { id: itemId, templateId } },
      criteria: { templateGateCriterion: { id: itemId, gate: { templateId } } }, checklist: { templateChecklistItem: { id: itemId, task: { templateId } } }, requirements: { templateRequestRequirement: { id: itemId, request: { templateId } } },
    };
    const [delegate, where] = Object.entries(checks[kind])[0] as [string, object];
    const found = await (this.prisma as never as Record<string, { findFirst: (a: object) => Promise<unknown> }>)[delegate].findFirst({ where });
    if (!found) throw new NotFoundException('Item não encontrado neste template.');
  }

  // ---------------------------------------------------------------- instanciação
  /** Resolve um template ATIVO para criação de projeto. */
  async activeForProject(templateId: string) {
    const template = await this.prisma.projectTemplate.findUnique({ where: { id: templateId }, select: { id: true, status: true } });
    if (!template) throw new BadRequestException('Template não encontrado.');
    if (template.status !== 'ACTIVE') throw new ConflictException('Somente templates ativos podem ser usados em novos projetos.');
    return template.id;
  }
  async activePlanCId() {
    const template = await this.prisma.projectTemplate.findFirst({ where: { code: PLAN_C_CODE, status: 'ACTIVE' }, orderBy: { version: 'desc' }, select: { id: true } });
    if (!template) throw new ConflictException('O template Plano C não está ativo.'); return template.id;
  }
}

/**
 * Copia a estrutura de um template para um projeto VAZIO (fases, Gates e critérios, atividades com checklist e dependências, solicitações e requisitos)
 * e registra no projeto somente a referência histórica (id, versão e snapshot de nome/versão). Não copia horas realizadas, evidências, auditoria,
 * aprovações, decisões, datas reais, usuários nem vínculos. Deve rodar na mesma transação que cria o projeto.
 */
export async function instantiateTemplate(tx: Prisma.TransactionClient, projectId: string, templateId: string, actor: { userId: string | null; role: string }) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, plannedStartDate: true, _count: { select: { phases: true, tasks: true } } } });
  if (!project) throw new NotFoundException('Projeto não encontrado.');
  if (project._count.phases || project._count.tasks) throw new ConflictException('O projeto já possui estrutura; o template só pode ser aplicado a um projeto sem fases e atividades.');
  const template = await tx.projectTemplate.findUnique({ where: { id: templateId }, include: treeInclude });
  if (!template) throw new BadRequestException('Template não encontrado.'); if (template.status !== 'ACTIVE') throw new ConflictException('Somente templates ativos podem ser usados em novos projetos.');
  await tx.project.update({ where: { id: projectId }, data: { methodology: template.methodology, templateId: template.id, templateVersion: template.version, templateNameSnapshot: template.name, templateVersionSnapshot: template.version } });

  const firstOrder = template.phases.length ? Math.min(...template.phases.map((phase) => phase.order)) : 0;
  const phaseIds = new Map<string, string>(); const gateIds = new Map<string, string>();
  for (const phase of template.phases) {
    phaseIds.set(phase.id, (await tx.phase.create({ data: { projectId, order: phase.order, name: phase.name, description: phase.description, plannedWeeks: phase.plannedWeeks, plannedJgm4Hours: phase.plannedJgm4Hours, status: phase.order === firstOrder ? 'AVAILABLE' : 'LOCKED' } })).id);
    const gate = template.gates.find((item) => item.phaseId === phase.id);
    if (gate) {
      const created = await tx.gate.create({ data: { projectId, phaseId: phaseIds.get(phase.id)!, code: gate.code, title: gate.title, question: gate.question } }); gateIds.set(gate.code, created.id);
      for (const criterion of gate.criteria) await tx.gateCriterion.create({ data: { gateId: created.id, code: criterion.code, description: criterion.description, sourceType: criterion.sourceType, order: criterion.order, mandatory: criterion.mandatory, evidenceRequired: criterion.evidenceRequired } });
    }
  }
  const taskIds = new Map<string, string>();
  for (const task of template.tasks) {
    const created = await tx.task.create({ data: { projectId, phaseId: phaseIds.get(task.phaseId)!, code: task.code, title: task.title, description: task.description, objective: task.objective, instructions: task.instructions, acceptanceCriteria: task.acceptanceCriteria,
      responsibilityType: task.responsibilityType, plannedJgm4Hours: task.plannedJgm4Hours, plannedClientHours: task.plannedClientHours, nextAction: 'Aguardar liberação das dependências.', currentOwnerType: 'SYSTEM', status: 'BLOCKED' } });
    taskIds.set(task.code, created.id);
    for (const item of task.checklist) await tx.taskRequirement.create({ data: { taskId: created.id, label: item.label, required: item.required } });
  }
  for (const task of template.tasks) {
    const predecessor = template.dependencies.find((d) => d.kind === 'TASK_AFTER_TASK' && d.fromCode === task.code); const gate = template.dependencies.find((d) => d.kind === 'TASK_BLOCKED_BY_GATE' && d.fromCode === task.code);
    const data = { predecessorTaskId: predecessor ? taskIds.get(predecessor.toCode) ?? null : null, blockedByGateId: gate ? gateIds.get(gate.toCode) ?? null : null };
    await tx.task.update({ where: { id: taskIds.get(task.code)! }, data });
    await tx.auditLog.create({ data: { projectId, entityType: 'Task', entityId: taskIds.get(task.code)!, action: 'PLAN_CREATED', userId: actor.userId, actorType: actor.role,
      newValue: { code: task.code, plannedJgm4Hours: Number(task.plannedJgm4Hours), plannedClientHours: Number(task.plannedClientHours), ...data, template: `${template.code}@${template.version}` } } });
  }
  for (const phase of template.phases) {
    const estimate = template.tasks.filter((task) => task.phaseId === phase.id).reduce((total, task) => total + Number(task.plannedClientHours), 0);
    await tx.phase.update({ where: { id: phaseIds.get(phase.id)! }, data: { plannedClientHours: phase.plannedClientHours ?? estimate } });
  }
  for (const request of template.requests) {
    const link = template.dependencies.find((d) => d.kind === 'REQUEST_FOR_TASK' && d.fromCode === request.code);
    const phase = template.phases.find((item) => item.id === request.phaseId)!;
    const dueDate = request.relativeDueDays !== null && project.plannedStartDate ? new Date(project.plannedStartDate.getTime() + request.relativeDueDays * 86400000) : null;
    const created = await tx.projectRequest.create({ data: { projectId, phaseId: phaseIds.get(request.phaseId)!, code: request.code, title: request.title, description: request.description, instructions: request.instructions, acceptanceCriteria: request.acceptanceCriteria,
      blocking: request.blocking, mandatory: request.mandatory, status: phase.order === firstOrder ? 'AVAILABLE' : 'BLOCKED', createdByUserId: actor.userId, taskId: link ? taskIds.get(link.toCode) ?? null : null, dueDate,
      requirements: { create: request.requirements.map((item) => ({ label: item.label, order: item.order, required: item.required })) } } });
    await tx.auditLog.create({ data: { projectId, entityType: 'ProjectRequest', entityId: created.id, action: 'CREATED', userId: actor.userId, actorType: actor.userId ? 'USER' : 'SYSTEM', newValue: { code: created.code, status: created.status, template: `${template.code}@${template.version}` } } });
  }
  // Libera as atividades sem pendência (mesma regra do seed e do fluxo de aprovação).
  let released = true;
  while (released) {
    released = false;
    const blocked = await tx.task.findMany({ where: { projectId, status: { in: ['BLOCKED', 'NOT_STARTED'] } }, include: { predecessor: { select: { status: true } }, gate: { select: { status: true } }, requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { id: true } } } });
    for (const task of blocked) {
      if (task.requests.length || (task.predecessor && task.predecessor.status !== 'COMPLETED') || (task.gate && task.gate.status !== 'APPROVED')) continue;
      const changed = await tx.task.updateMany({ where: { id: task.id, version: task.version, status: task.status }, data: { status: 'RELEASED', currentOwnerType: task.responsibilityType === 'JGM4' ? 'JGM4' : 'CLIENT', nextAction: 'Iniciar a atividade liberada.', version: { increment: 1 } } });
      if (changed.count) { await tx.auditLog.create({ data: { projectId, entityType: 'Task', entityId: task.id, action: 'RELEASED', actorType: 'SYSTEM', oldValue: { status: task.status, version: task.version }, newValue: { status: 'RELEASED', version: task.version + 1 } } }); released = true; }
    }
  }
  const counts = { phases: await tx.phase.count({ where: { projectId } }), gates: await tx.gate.count({ where: { projectId } }), tasks: await tx.task.count({ where: { projectId } }), requests: await tx.projectRequest.count({ where: { projectId } }) };
  await tx.auditLog.create({ data: { projectId, entityType: 'Project', entityId: projectId, action: 'PROJECT_CREATED_FROM_TEMPLATE', userId: actor.userId, actorType: actor.role,
    newValue: { templateId: template.id, template: template.code, templateName: template.name, version: template.version, ...counts, startedOn: iso(project.plannedStartDate) } } });
  return counts;
}
