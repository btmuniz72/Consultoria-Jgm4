import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { currentRole, currentUserId, isJgm4Role } from '../approvals/authority';
import { SecurityEventsService } from '../security/security-events.service';
import { appEnv } from '../security/config';
import { instantiateTemplate } from '../templates/templates.service';
import { PLAN_C_CODE } from '../templates/plano-c.template';
import { Prisma } from '../generated/prisma/client';

export const PROJECT_ROLES = ['CONSULTANT_LEAD', 'CLIENT_SPONSOR', 'CLIENT_MANAGER', 'TEAM_MEMBER'] as const;
const SINGLE_HOLDER = ['CONSULTANT_LEAD', 'CLIENT_SPONSOR', 'CLIENT_MANAGER'];
const INITIAL_STATUS = ['PLANNING', 'IN_PROGRESS'] as const;

export class CompanyDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(60) internalCode?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class CompanyPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(60) internalCode?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class CompanyStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE']) status!: 'ACTIVE' | 'INACTIVE';
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsString() @MaxLength(200) confirmPassword!: string;
  @IsOptional() @IsString() @MaxLength(8) mfaCode?: string;
}
export class UserPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsUUID() companyId?: string;
}
export class ProjectCreateDto {
  @IsUUID() companyId!: string;
  @IsString() @MinLength(3) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsString() @MinLength(3) @MaxLength(3000) description!: string;
  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() plannedEndDate?: string;
  @IsOptional() @IsIn([...INITIAL_STATUS]) status?: (typeof INITIAL_STATUS)[number];
  @IsOptional() @IsUUID() consultantUserId?: string;
  @IsOptional() @IsUUID() sponsorUserId?: string;
  @IsOptional() @IsUUID() managerUserId?: string;
  @IsOptional() @IsUUID() templateId?: string;
  /** Compatibilidade com a 10A: equivale a escolher a versão ativa do template PLAN_C. */
  @IsOptional() @IsBoolean() usePlanC?: boolean;
}
export class ApplyTemplateDto { @IsUUID() templateId!: string }
export class ProjectPatchDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3000) description?: string;
  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() plannedEndDate?: string;
}
export class AdminMemberDto {
  @IsUUID() userId!: string;
  @IsIn([...PROJECT_ROLES]) roleInProject!: (typeof PROJECT_ROLES)[number];
}
export class AdminMemberPatchDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn([...PROJECT_ROLES]) roleInProject?: (typeof PROJECT_ROLES)[number];
  @IsOptional() @IsString() @MaxLength(200) confirmPassword?: string;
  @IsOptional() @IsString() @MaxLength(8) mfaCode?: string;
}
export class ActivateDto { @IsString() @MinLength(5) @MaxLength(500) reason!: string }
export class ReasonedDto { @IsOptional() @IsString() @MaxLength(500) reason?: string }

const day = (value?: string) => (value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : undefined);
const contains = (q?: string) => (q?.trim() ? { contains: q.trim(), mode: 'insensitive' as const } : undefined);

// Administração operacional (Etapa 10A): empresas, projetos, vínculos e responsabilidades. Somente JGM4_ADMIN (controlador);
// toda alteração gera AuditLog e as sensíveis também SecurityEvent. Validações ficam no backend.
@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService, private readonly events: SecurityEventsService) {}

  private audit(db: Prisma.TransactionClient | PrismaService, input: { projectId?: string | null; entityType: string; entityId: string; action: string; oldValue?: Prisma.InputJsonValue; newValue?: Prisma.InputJsonValue }) {
    return db.auditLog.create({ data: { projectId: input.projectId ?? null, entityType: input.entityType, entityId: input.entityId, action: input.action, oldValue: input.oldValue, newValue: input.newValue, userId: currentUserId(), actorType: currentRole() } });
  }
  private reauth(input: { confirmPassword?: string; mfaCode?: string }) { return this.auth.reauthenticate(currentUserId()!, { password: input.confirmPassword, mfaCode: input.mfaCode }); }
  /** Link de definição de senha só é devolvido em desenvolvimento/teste (sem e-mail real); nunca em staging/produção. */
  devLinkAllowed() { return ['development', 'test'].includes(appEnv()); }

  // ---------------------------------------------------------------- empresas
  private presentCompany(company: { id: string; name: string; displayName: string | null; internalCode: string | null; notes: string | null; active: boolean; createdAt: Date; updatedAt: Date; _count?: { projects: number; users: number } }) {
    return { id: company.id, name: company.name, displayName: company.displayName, internalCode: company.internalCode, notes: company.notes, status: company.active ? 'ACTIVE' : 'INACTIVE', createdAt: company.createdAt, updatedAt: company.updatedAt, projects: company._count?.projects ?? 0, users: company._count?.users ?? 0 };
  }
  async companies(query: { q?: string; status?: string }) {
    const rows = await this.prisma.company.findMany({ where: { ...(query.status === 'ACTIVE' ? { active: true } : query.status === 'INACTIVE' ? { active: false } : {}),
      ...(query.q?.trim() ? { OR: [{ name: contains(query.q)! }, { displayName: contains(query.q)! }, { internalCode: contains(query.q)! }] } : {}) }, orderBy: { name: 'asc' }, include: { _count: { select: { projects: true, users: true } } } });
    return rows.map((row) => this.presentCompany(row));
  }
  private async uniqueCompany(name: string, internalCode: string | undefined, exceptId?: string) {
    const clash = await this.prisma.company.findFirst({ where: { id: exceptId ? { not: exceptId } : undefined, OR: [{ name: { equals: name.trim(), mode: 'insensitive' } }, ...(internalCode ? [{ internalCode }] : [])] } });
    if (clash) throw new ConflictException('Já existe uma empresa com este nome ou identificação interna.');
  }
  async createCompany(dto: CompanyDto) {
    const internalCode = dto.internalCode?.trim() || undefined; await this.uniqueCompany(dto.name, internalCode);
    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({ data: { name: dto.name.trim(), displayName: dto.displayName?.trim() || null, internalCode: internalCode ?? null, notes: dto.notes?.trim() || null } });
      await this.audit(tx, { entityType: 'Company', entityId: created.id, action: 'COMPANY_CREATED', newValue: { name: created.name, internalCode: created.internalCode } });
      return created;
    });
    return this.presentCompany(company);
  }
  async updateCompany(id: string, dto: CompanyPatchDto) {
    const company = await this.prisma.company.findUnique({ where: { id } }); if (!company) throw new NotFoundException('Empresa não encontrada.');
    const internalCode = dto.internalCode === undefined ? undefined : dto.internalCode.trim() || null;
    await this.uniqueCompany(dto.name ?? company.name, internalCode ?? undefined, id);
    const data = { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() || null } : {}), ...(internalCode !== undefined ? { internalCode } : {}), ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}) };
    if (!Object.keys(data).length) throw new BadRequestException('Nada a alterar.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.company.update({ where: { id }, data });
      await this.audit(tx, { entityType: 'Company', entityId: id, action: 'COMPANY_UPDATED', oldValue: { name: company.name, displayName: company.displayName, internalCode: company.internalCode, notes: company.notes }, newValue: data });
      return row;
    });
    return this.presentCompany(updated);
  }
  async setCompanyStatus(id: string, dto: CompanyStatusDto) {
    await this.reauth(dto);
    const company = await this.prisma.company.findUnique({ where: { id } }); if (!company) throw new NotFoundException('Empresa não encontrada.');
    const active = dto.status === 'ACTIVE'; if (company.active === active) throw new ConflictException('A empresa já está neste estado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data: { active } });
      await this.audit(tx, { entityType: 'Company', entityId: id, action: active ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED', oldValue: { status: company.active ? 'ACTIVE' : 'INACTIVE' }, newValue: { status: dto.status, reason: dto.reason } });
    });
    // Usuários da empresa deixam de autenticar (verificado a cada requisição); sessões existentes são encerradas já.
    if (!active) for (const user of await this.prisma.user.findMany({ where: { companyId: id }, select: { id: true } })) await this.auth.revokeAll(user.id, 'empresa_inativada');
    await this.events.record('COMPANY_STATUS_CHANGED', { userId: currentUserId(), metadata: { companyId: id, to: dto.status, reason: dto.reason } });
    return { id, status: dto.status };
  }

  // ---------------------------------------------------------------- usuários (complementos)
  async patchUser(id: string, dto: UserPatchDto) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { memberships: { where: { active: true }, select: { id: true } } } }); if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.anonymizedAt) throw new ConflictException('Usuário anonimizado.');
    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.companyId !== undefined && dto.companyId !== user.companyId) {
      if (isJgm4Role(user.role as never)) throw new BadRequestException('Usuários JGM4 não pertencem a uma empresa cliente.');
      if (user.memberships.length) throw new ConflictException('Remova os vínculos ativos com projetos antes de trocar a empresa do usuário.');
      if (!(await this.prisma.company.findFirst({ where: { id: dto.companyId, active: true } }))) throw new BadRequestException('Empresa inválida ou inativa.');
      data.companyId = dto.companyId;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nada a alterar.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      await this.audit(tx, { entityType: 'User', entityId: id, action: 'USER_UPDATED', oldValue: { name: user.name, companyId: user.companyId }, newValue: data as Prisma.InputJsonValue });
    });
    return { id, ...data };
  }
  /** Reenvia/gera o acesso (link de uso único por e-mail). Nunca existe senha visível; em desenvolvimento o link também é devolvido. */
  async resetAccess(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } }); if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.anonymizedAt || user.status !== 'ACTIVE') throw new ConflictException('Somente usuários ativos recebem acesso.');
    const link = await this.auth.issueToken(id, user.email, user.lastLoginAt ? 'RESET' : 'SETUP');
    await this.audit(this.prisma, { entityType: 'User', entityId: id, action: 'USER_ACCESS_RESET', newValue: { by: 'admin' } });
    await this.events.record('ADMIN_ACCESS_RESET', { userId: currentUserId(), metadata: { targetUserId: id } });
    return { id, sent: true, ...(this.devLinkAllowed() ? { devLink: link } : {}) };
  }

  // ---------------------------------------------------------------- projetos
  async projects(query: { q?: string; companyId?: string; status?: string; consultantId?: string; phase?: string }) {
    const rows = await this.prisma.project.findMany({ orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }], where: {
      ...(query.companyId ? { companyId: query.companyId } : {}), ...(query.status ? { status: query.status as never } : {}),
      ...(query.q?.trim() ? { OR: [{ name: contains(query.q)! }, { code: contains(query.q)! }] } : {}),
      ...(query.consultantId ? { memberships: { some: { userId: query.consultantId, roleInProject: 'CONSULTANT_LEAD', active: true } } } : {}),
      ...(query.phase !== undefined && query.phase !== '' ? { phases: { some: { order: Number(query.phase), status: { in: ['AVAILABLE', 'IN_PROGRESS', 'WAITING_GATE'] } } } } : {}) },
    include: { company: { select: { id: true, name: true, active: true } }, phases: { orderBy: { order: 'asc' }, select: { order: true, name: true, status: true } },
      memberships: { where: { active: true }, select: { userId: true, roleInProject: true, user: { select: { name: true } } } }, _count: { select: { tasks: true } } } });
    const done = await this.prisma.task.groupBy({ by: ['projectId'], where: { projectId: { in: rows.map((row) => row.id) }, status: 'COMPLETED' }, _count: { _all: true } });
    const completed = new Map(done.map((row) => [row.projectId, row._count._all]));
    return rows.map((project) => {
      const current = project.phases.find((phase) => ['AVAILABLE', 'IN_PROGRESS', 'WAITING_GATE'].includes(phase.status)) ?? (project.phases.length && project.phases.every((phase) => phase.status === 'COMPLETED') ? project.phases[project.phases.length - 1] : null);
      const holder = (role: string) => project.memberships.find((member) => member.roleInProject === role)?.user.name ?? null;
      const total = project._count.tasks;
      return { id: project.id, code: project.code, name: project.name, status: project.status, company: project.company.name, companyId: project.companyId, companyActive: project.company.active,
        plannedStartDate: project.plannedStartDate, plannedEndDate: project.plannedEndDate, currentPhase: current ? `Fase ${current.order} — ${current.name}` : null, hasStructure: project.phases.length > 0,
        consultant: holder('CONSULTANT_LEAD'), sponsor: holder('CLIENT_SPONSOR'), manager: holder('CLIENT_MANAGER'), activeUsers: project.memberships.length,
        progress: total ? Math.round(((completed.get(project.id) ?? 0) / total) * 100) : 0, tasks: total };
    });
  }
  private async projectOrFail(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { company: { select: { id: true, name: true, active: true } } } });
    if (!project) throw new NotFoundException('Projeto não encontrado.'); return project;
  }
  private checkDates(start?: Date, end?: Date) { if (start && end && end < start) throw new BadRequestException('A data de término não pode ser anterior à de início.'); }

  async createProject(dto: ProjectCreateDto) {
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new BadRequestException('Empresa não encontrada.');
    if (!company.active) throw new ConflictException('Empresa inativa não recebe novos projetos.');
    const start = day(dto.plannedStartDate); const end = day(dto.plannedEndDate); this.checkDates(start, end);
    const code = dto.code?.trim().toUpperCase() || undefined;
    let templateId = dto.templateId;
    if (!templateId && dto.usePlanC) templateId = (await this.prisma.projectTemplate.findFirst({ where: { code: PLAN_C_CODE, status: 'ACTIVE' }, orderBy: { version: 'desc' }, select: { id: true } }))?.id ?? undefined;
    if (templateId) { const t = await this.prisma.projectTemplate.findUnique({ where: { id: templateId }, select: { status: true } }); if (!t) throw new BadRequestException('Template não encontrado.'); if (t.status !== 'ACTIVE') throw new ConflictException('Somente templates ativos podem ser usados em novos projetos.'); } else if (dto.usePlanC) throw new ConflictException('O template Plano C não está ativo.');
    if (await this.prisma.project.findFirst({ where: { OR: [{ companyId: dto.companyId, name: dto.name.trim() }, ...(code ? [{ code }] : [])] } })) throw new ConflictException('Já existe um projeto com este nome na empresa ou com este código.');
    const created = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data: { companyId: dto.companyId, name: dto.name.trim(), code: code ?? null, description: dto.description.trim(), methodology: 'BASICO', status: dto.status ?? 'PLANNING', plannedStartDate: start, plannedEndDate: end } });
      await this.audit(tx, { projectId: project.id, entityType: 'Project', entityId: project.id, action: 'PROJECT_CREATED', newValue: { name: project.name, code: project.code, companyId: project.companyId, status: project.status } });
      for (const [userId, role] of [[dto.consultantUserId, 'CONSULTANT_LEAD'], [dto.sponsorUserId, 'CLIENT_SPONSOR'], [dto.managerUserId, 'CLIENT_MANAGER']] as const) if (userId) await this.assign(tx, project.id, project.companyId, userId, role);
      if (templateId) await instantiateTemplate(tx, project.id, templateId, { userId: currentUserId(), role: currentRole() });
      return project;
    }, { timeout: 60000 });
    await this.events.record('PROJECT_CREATED', { userId: currentUserId(), projectId: created.id, metadata: { companyId: created.companyId, templateId: templateId ?? null } });
    return this.one(created.id);
  }
  async updateProject(id: string, dto: ProjectPatchDto) {
    const project = await this.projectOrFail(id);
    if (project.status === 'CANCELLED') throw new ConflictException('Projeto cancelado: somente consulta.');
    const start = dto.plannedStartDate !== undefined ? day(dto.plannedStartDate) : project.plannedStartDate ?? undefined; const end = dto.plannedEndDate !== undefined ? day(dto.plannedEndDate) : project.plannedEndDate ?? undefined; this.checkDates(start, end);
    const code = dto.code === undefined ? undefined : dto.code.trim().toUpperCase() || null;
    const name = dto.name?.trim();
    if (name || code) { const clash = await this.prisma.project.findFirst({ where: { id: { not: id }, OR: [...(name ? [{ companyId: project.companyId, name }] : []), ...(code ? [{ code }] : [])] } }); if (clash) throw new ConflictException('Já existe um projeto com este nome na empresa ou com este código.'); }
    const data = { ...(name ? { name } : {}), ...(code !== undefined ? { code } : {}), ...(dto.description !== undefined ? { description: dto.description.trim() } : {}), ...(dto.plannedStartDate !== undefined ? { plannedStartDate: start } : {}), ...(dto.plannedEndDate !== undefined ? { plannedEndDate: end } : {}) };
    if (!Object.keys(data).length) throw new BadRequestException('Nada a alterar.');
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data });
      await this.audit(tx, { projectId: id, entityType: 'Project', entityId: id, action: 'PROJECT_UPDATED', oldValue: { name: project.name, code: project.code, description: project.description }, newValue: JSON.parse(JSON.stringify(data)) });
    });
    return this.one(id);
  }
  async activate(id: string, dto: ActivateDto) {
    const project = await this.projectOrFail(id);
    if (!['PLANNING', 'PLANNED'].includes(project.status)) throw new ConflictException(`Somente projetos em planejamento podem ser ativados (estado atual: ${project.status}).`);
    if (!project.company.active) throw new ConflictException('Empresa inativa.');
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { status: 'IN_PROGRESS', actualStartDate: new Date() } });
      await tx.projectStatusEvent.create({ data: { projectId: id, fromStatus: project.status, toStatus: 'IN_PROGRESS', reason: dto.reason.trim(), effectiveDate: new Date(), createdByUserId: currentUserId(), createdByRole: currentRole() } });
      await this.audit(tx, { projectId: id, entityType: 'Project', entityId: id, action: 'PROJECT_ACTIVATED', oldValue: { status: project.status }, newValue: { status: 'IN_PROGRESS', reason: dto.reason.trim() } });
    });
    return this.one(id);
  }
  /** Aplica um template ATIVO a um projeto sem estrutura. */
  async applyTemplate(id: string, templateId: string) {
    const project = await this.projectOrFail(id);
    if (project.status === 'CANCELLED') throw new ConflictException('Projeto cancelado: somente consulta.');
    const counts = await this.prisma.$transaction((tx) => instantiateTemplate(tx, id, templateId, { userId: currentUserId(), role: currentRole() }), { timeout: 60000 });
    return { id, ...counts };
  }
  async clonePlanC(id: string) {
    const template = await this.prisma.projectTemplate.findFirst({ where: { code: PLAN_C_CODE, status: 'ACTIVE' }, orderBy: { version: 'desc' }, select: { id: true } });
    if (!template) throw new ConflictException('O template Plano C não está ativo.');
    return this.applyTemplate(id, template.id);
  }
  async one(id: string) { const [row] = (await this.projects({})).filter((project) => project.id === id); if (!row) throw new NotFoundException('Projeto não encontrado.'); return row; }

  // ---------------------------------------------------------------- vínculos e responsabilidades
  /** Regras: cliente só na própria empresa (ativa); responsabilidades únicas (lead/sponsor/manager) rebaixam o titular anterior a TEAM_MEMBER. */
  private async assign(tx: Prisma.TransactionClient, projectId: string, companyId: string, userId: string, role: (typeof PROJECT_ROLES)[number]) {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { company: { select: { active: true } } } });
    if (!user || user.status !== 'ACTIVE' || !user.active || user.anonymizedAt) throw new NotFoundException('Usuário não encontrado ou inativo.');
    const client = !isJgm4Role(user.role as never);
    if (client && (user.companyId !== companyId || !user.company?.active)) throw new ForbiddenException('Usuário do cliente só pode ser vinculado a projetos da própria empresa (ativa).');
    if (role === 'CONSULTANT_LEAD' && !['JGM4_CONSULTANT', 'JGM4_ADMIN'].includes(user.role)) throw new BadRequestException('O consultor principal deve ser um usuário JGM4.');
    if ((role === 'CLIENT_SPONSOR' || role === 'CLIENT_MANAGER') && !client) throw new BadRequestException('Patrocinador e gestor do cliente devem ser usuários do cliente.');
    if (SINGLE_HOLDER.includes(role)) {
      const holders = await tx.projectMembership.findMany({ where: { projectId, roleInProject: role, active: true, userId: { not: userId } } });
      for (const holder of holders) {
        await tx.projectMembership.update({ where: { id: holder.id }, data: { roleInProject: 'TEAM_MEMBER' } });
        await this.audit(tx, { projectId, entityType: 'ProjectMembership', entityId: holder.id, action: 'RESPONSIBLE_CHANGED', oldValue: { userId: holder.userId, roleInProject: role }, newValue: { userId: holder.userId, roleInProject: 'TEAM_MEMBER', replacedBy: userId } });
      }
    }
    const existing = await tx.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId } } });
    const membership = existing
      ? await tx.projectMembership.update({ where: { id: existing.id }, data: { active: true, roleInProject: role } })
      : await tx.projectMembership.create({ data: { projectId, userId, roleInProject: role } });
    await this.audit(tx, { projectId, entityType: 'ProjectMembership', entityId: membership.id, action: existing?.active ? (existing.roleInProject !== role ? 'RESPONSIBLE_CHANGED' : 'MEMBERSHIP_UPDATED') : 'MEMBERSHIP_ADDED',
      oldValue: existing ? { roleInProject: existing.roleInProject, active: existing.active } : undefined, newValue: { targetUserId: userId, name: user.name, roleInProject: role } });
    if (role === 'CLIENT_SPONSOR') await tx.project.update({ where: { id: projectId }, data: { sponsorUserId: userId } });
    return { membership, user };
  }
  async members(projectId: string) {
    await this.projectOrFail(projectId);
    const rows = await this.prisma.projectMembership.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, email: true, role: true, status: true, company: { select: { name: true } } } } } });
    return rows.map((row) => ({ membershipId: row.id, userId: row.userId, name: row.user.name, email: row.user.email, role: row.user.role, userStatus: row.user.status, company: row.user.company?.name ?? null, roleInProject: row.roleInProject, active: row.active }));
  }
  async addMember(projectId: string, dto: AdminMemberDto) {
    const project = await this.projectOrFail(projectId);
    if (project.status === 'CANCELLED') throw new ConflictException('Projeto cancelado: somente consulta.');
    if (!project.company.active) throw new ConflictException('Empresa inativa.');
    const result = await this.prisma.$transaction((tx) => this.assign(tx, projectId, project.companyId, dto.userId, dto.roleInProject));
    await this.events.record('MEMBERSHIP_CHANGED', { userId: currentUserId(), projectId, metadata: { action: 'added', targetUserId: dto.userId, roleInProject: dto.roleInProject } });
    return { membershipId: result.membership.id, userId: dto.userId, roleInProject: dto.roleInProject, active: true };
  }
  async patchMember(projectId: string, membershipId: string, dto: AdminMemberPatchDto) {
    const project = await this.projectOrFail(projectId);
    if (project.status === 'CANCELLED') throw new ConflictException('Projeto cancelado: somente consulta.');
    const membership = await this.prisma.projectMembership.findFirst({ where: { id: membershipId, projectId } }); if (!membership) throw new NotFoundException('Vínculo não encontrado neste projeto.');
    if (dto.active === undefined && dto.roleInProject === undefined) throw new BadRequestException('Nada a alterar.');
    if (dto.active === false && membership.active) await this.reauth(dto);
    if (dto.active === false) {
      await this.prisma.$transaction(async (tx) => {
        await tx.projectMembership.update({ where: { id: membershipId }, data: { active: false } });
        if (membership.roleInProject === 'CLIENT_SPONSOR') await tx.project.updateMany({ where: { id: projectId, sponsorUserId: membership.userId }, data: { sponsorUserId: null } });
        await this.audit(tx, { projectId, entityType: 'ProjectMembership', entityId: membershipId, action: 'MEMBERSHIP_REMOVED', oldValue: { active: true, roleInProject: membership.roleInProject }, newValue: { targetUserId: membership.userId, active: false } });
      });
      await this.events.record('MEMBERSHIP_CHANGED', { userId: currentUserId(), projectId, metadata: { action: 'removed', targetUserId: membership.userId } });
      return { membershipId, active: false };
    }
    const role = dto.roleInProject ?? (membership.roleInProject as (typeof PROJECT_ROLES)[number]) ?? 'TEAM_MEMBER';
    await this.prisma.$transaction((tx) => this.assign(tx, projectId, project.companyId, membership.userId, PROJECT_ROLES.includes(role as never) ? role : 'TEAM_MEMBER'));
    await this.events.record('MEMBERSHIP_CHANGED', { userId: currentUserId(), projectId, metadata: { action: 'role', targetUserId: membership.userId, roleInProject: role } });
    return { membershipId, active: true, roleInProject: role };
  }
}
