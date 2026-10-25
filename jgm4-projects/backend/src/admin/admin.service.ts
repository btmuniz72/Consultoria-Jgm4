import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { IsArray, IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { bcryptCost } from '../auth/auth.config';
import { ROLES, currentRole, currentUserId, isJgm4Role } from '../approvals/authority';
import { randomToken } from '../security/crypto';
import { appEnv } from '../security/config';
import { SecurityEventsService } from '../security/security-events.service';
import { IncidentStatus, UserStatus } from '../generated/prisma/client';

export class Reauth { @IsString() @MaxLength(200) confirmPassword!: string; @IsOptional() @IsString() @MaxLength(8) mfaCode?: string }
export class CreateUserDto { @IsString() @MinLength(2) @MaxLength(120) name!: string; @IsEmail() @MaxLength(254) email!: string; @IsIn([...ROLES]) role!: string; @IsOptional() @IsUUID() companyId?: string }
export class UserStatusDto extends Reauth { @IsEnum(UserStatus) status!: UserStatus; @IsString() @MinLength(5) @MaxLength(500) reason!: string }
export class UserRoleDto extends Reauth { @IsIn([...ROLES]) role!: string; @IsString() @MinLength(5) @MaxLength(500) reason!: string }
export class AnonymizeDto extends Reauth { @IsString() @MinLength(5) @MaxLength(500) reason!: string }
export class IncidentDto {
  @IsString() @MinLength(5) @MaxLength(200) title!: string; @IsString() @MinLength(5) @MaxLength(5000) description!: string;
  @IsOptional() @IsString() @MaxLength(3000) impact?: string; @IsOptional() @IsString() @MaxLength(3000) affectedData?: string; @IsOptional() @IsArray() @IsUUID('all', { each: true }) affectedCompanyIds?: string[];
  @IsOptional() @IsString() @MaxLength(3000) actionsTaken?: string; @IsOptional() @IsUUID() responsibleUserId?: string; @IsOptional() @IsDateString() occurredAt?: string;
}
export class IncidentUpdateDto {
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus; @IsString() @MinLength(3) @MaxLength(3000) note!: string;
  @IsOptional() @IsString() @MaxLength(3000) impact?: string; @IsOptional() @IsString() @MaxLength(3000) affectedData?: string; @IsOptional() @IsString() @MaxLength(3000) actionsTaken?: string; @IsOptional() @IsUUID() responsibleUserId?: string;
}
export class SecurityEventsQuery { @IsOptional() @IsString() @MaxLength(60) type?: string; @IsOptional() @IsUUID() userId?: string; @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string; @IsOptional() @IsString() limit?: string; @IsOptional() @IsString() offset?: string }
export class AccessReviewQuery { @IsOptional() @IsString() inactiveDays?: string }

const ORDER: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'];
const DAY = 86400000;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService, private readonly events: SecurityEventsService) {}

  private async reauth(input: Reauth) { await this.auth.reauthenticate(currentUserId()!, { password: input.confirmPassword, mfaCode: input.mfaCode }); }
  private async activeAdmins(excludeId?: string) { return this.prisma.user.count({ where: { role: 'JGM4_ADMIN', status: 'ACTIVE', active: true, ...(excludeId ? { id: { not: excludeId } } : {}) } }); }
  private async target(id: string) { const user = await this.prisma.user.findUnique({ where: { id } }); if (!user) throw new NotFoundException('Usuário não encontrado.'); return user; }

  // ---------------------------------------------------------------- usuários
  async users(filters: { q?: string; companyId?: string; role?: string; status?: string } = {}) {
    const q = filters.q?.trim();
    const users = await this.prisma.user.findMany({ where: { ...(filters.companyId ? { companyId: filters.companyId } : {}), ...(filters.role ? { role: filters.role as never } : {}), ...(filters.status ? { status: filters.status as never } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }] } : {}) }, orderBy: [{ role: 'asc' }, { name: 'asc' }], include: { company: { select: { name: true } }, memberships: { include: { project: { select: { name: true } } } } } });
    const now = Date.now();
    return users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, company: user.company?.name ?? null, companyId: user.companyId, status: user.status, statusReason: user.statusReason, mfaEnabled: user.mfaEnabled, mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt, lastActivityAt: user.lastActivityAt, locked: !!user.lockedUntil && user.lockedUntil.getTime() > now, anonymizedAt: user.anonymizedAt,
      memberships: user.memberships.map((member) => ({ id: member.id, projectId: member.projectId, project: member.project.name, roleInProject: member.roleInProject, active: member.active })) }));
  }
  async createUser(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Já existe um usuário com este e-mail.');
    const client = !isJgm4Role(dto.role as never);
    if (client && !dto.companyId) throw new BadRequestException('Usuários do cliente precisam de empresa.');
    if (!client && dto.companyId) throw new BadRequestException('Usuários JGM4 não pertencem a uma empresa cliente.');
    if (dto.companyId && !(await this.prisma.company.findFirst({ where: { id: dto.companyId, active: true } }))) throw new BadRequestException('Empresa inválida.');
    // Conta criada sem senha utilizável: o usuário define a própria senha pelo link enviado por e-mail (uso único, 24 h).
    const user = await this.prisma.user.create({ data: { name: dto.name.trim(), email, role: dto.role as never, companyId: dto.companyId ?? null, passwordHash: await hash(randomToken(24), bcryptCost()), mustChangePassword: true } });
    const link = await this.auth.issueToken(user.id, user.email, 'SETUP');
    await this.prisma.auditLog.create({ data: { projectId: null, entityType: 'User', entityId: user.id, action: 'USER_CREATED', userId: currentUserId(), actorType: currentRole(), newValue: { email: user.email, role: user.role, companyId: user.companyId } } });
    await this.events.record('USER_CREATED', { userId: currentUserId(), metadata: { targetUserId: user.id, role: user.role } });
    // Sem senha visível: o acesso é definido pelo próprio usuário pelo link de uso único. O link só é devolvido em desenvolvimento/teste.
    return { id: user.id, email: user.email, role: user.role, ...(['development', 'test'].includes(appEnv()) ? { devLink: link } : {}) };
  }
  async setStatus(id: string, dto: UserStatusDto) {
    await this.reauth(dto); const user = await this.target(id);
    if (id === currentUserId()) throw new BadRequestException('Você não pode alterar o próprio estado.');
    if (user.anonymizedAt) throw new ConflictException('Usuário anonimizado.');
    if (dto.status !== 'ACTIVE' && user.role === 'JGM4_ADMIN' && (await this.activeAdmins(id)) === 0) throw new ConflictException('Não é possível desativar o último administrador ativo.');
    await this.prisma.user.update({ where: { id }, data: { status: dto.status, statusReason: dto.status === 'ACTIVE' ? null : dto.reason, active: dto.status === 'ACTIVE', ...(dto.status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}) } });
    if (dto.status !== 'ACTIVE') await this.auth.revokeAll(id, `usuario_${dto.status.toLowerCase()}`);
    await this.prisma.auditLog.create({ data: { projectId: null, entityType: 'User', entityId: id, action: dto.status === 'BLOCKED' ? 'USER_BLOCKED' : dto.status === 'INACTIVE' ? 'USER_DISABLED' : 'USER_ENABLED', userId: currentUserId(), actorType: currentRole(), oldValue: { status: user.status }, newValue: { status: dto.status, reason: dto.reason } } });
    await this.events.record('USER_STATUS_CHANGED', { userId: currentUserId(), metadata: { targetUserId: id, from: user.status, to: dto.status, reason: dto.reason } });
    return { id, status: dto.status };
  }
  async setRole(id: string, dto: UserRoleDto) {
    await this.reauth(dto); const user = await this.target(id);
    if (id === currentUserId()) throw new BadRequestException('Você não pode alterar o próprio perfil.');
    const client = !isJgm4Role(dto.role as never);
    if (client !== !isJgm4Role(user.role as never)) throw new BadRequestException('Não é permitido trocar entre perfil JGM4 e perfil de cliente; crie uma nova conta.');
    if (user.role === 'JGM4_ADMIN' && dto.role !== 'JGM4_ADMIN' && (await this.activeAdmins(id)) === 0) throw new ConflictException('Não é possível rebaixar o último administrador ativo.');
    await this.prisma.user.update({ where: { id }, data: { role: dto.role as never } });
    await this.auth.revokeAll(id, 'perfil_alterado');
    await this.prisma.auditLog.create({ data: { projectId: null, entityType: 'User', entityId: id, action: 'USER_ROLE_CHANGED', userId: currentUserId(), actorType: currentRole(), oldValue: { role: user.role }, newValue: { role: dto.role, reason: dto.reason } } });
    await this.events.record('USER_ROLE_CHANGED', { userId: currentUserId(), metadata: { targetUserId: id, roleFrom: user.role, roleTo: dto.role, reason: dto.reason } });
    return { id, role: dto.role };
  }
  /** Anonimiza dados pessoais preservando o histórico operacional e de auditoria (registros continuam apontando para o usuário anonimizado). */
  async anonymize(id: string, dto: AnonymizeDto) {
    await this.reauth(dto); const user = await this.target(id);
    if (id === currentUserId()) throw new BadRequestException('Você não pode anonimizar a própria conta.');
    if (user.anonymizedAt) throw new ConflictException('Usuário já anonimizado.');
    if (user.role === 'JGM4_ADMIN' && (await this.activeAdmins(id)) === 0) throw new ConflictException('Não é possível anonimizar o último administrador ativo.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { name: 'Usuário anonimizado', email: `anonimo-${id}@anonimizado.invalid`, passwordHash: await hash(randomToken(24), bcryptCost()), status: 'INACTIVE', active: false,
        mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, anonymizedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
      await tx.projectMembership.updateMany({ where: { userId: id }, data: { active: false } });
      await tx.passwordResetToken.deleteMany({ where: { userId: id, usedAt: null } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'anonimizacao', ip: null, userAgent: null } });
    });
    await this.events.record('USER_ANONYMIZED', { userId: currentUserId(), metadata: { targetUserId: id, reason: dto.reason } });
    return { id, anonymized: true };
  }
  async revokeSessions(id: string) { await this.target(id); return { revoked: await this.auth.revokeAll(id, 'revogada_pelo_administrador') }; }
  async unlock(id: string) { await this.target(id); await this.prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } }); return { id, locked: false }; }

  // ---------------------------------------------------------------- revisão de acessos
  async accessReview(inactiveDays = 90) {
    const users = await this.users(); const limit = Date.now() - inactiveDays * DAY;
    return users.map((user) => {
      const lastSeen = Math.max(user.lastActivityAt?.getTime() ?? 0, user.lastLoginAt?.getTime() ?? 0);
      const activeMemberships = user.memberships.filter((member) => member.active);
      return { ...user, noLoginDays: user.lastLoginAt ? Math.floor((Date.now() - user.lastLoginAt.getTime()) / DAY) : null,
        flags: [...(user.status === 'ACTIVE' && (!user.lastLoginAt || user.lastLoginAt.getTime() < limit) ? [`Sem login há mais de ${inactiveDays} dias`] : []),
          ...(user.status === 'ACTIVE' && activeMemberships.length && lastSeen < limit ? ['Vínculo ativo sem atividade recente'] : []), ...(user.locked ? ['Conta bloqueada temporariamente'] : []), ...(user.status === 'BLOCKED' ? ['Conta bloqueada pelo administrador'] : []),
          ...(user.role === 'JGM4_ADMIN' && !user.mfaEnabled ? ['Administrador sem verificação em duas etapas'] : []), ...(user.status === 'ACTIVE' && !activeMemberships.length && user.role !== 'JGM4_ADMIN' ? ['Sem vínculo ativo com projeto'] : [])] };
    });
  }

  // ---------------------------------------------------------------- incidentes
  incidents() { return this.prisma.securityIncident.findMany({ orderBy: [{ createdAt: 'desc' }], take: 200 }); }
  async incident(id: string) {
    const incident = await this.prisma.securityIncident.findUnique({ where: { id }, include: { events: { orderBy: { at: 'asc' } } } });
    if (!incident) throw new NotFoundException('Incidente não encontrado.'); return incident;
  }
  async createIncident(dto: IncidentDto) {
    const incident = await this.prisma.securityIncident.create({ data: { title: dto.title.trim(), description: dto.description.trim(), impact: dto.impact?.trim() || null, affectedData: dto.affectedData?.trim() || null, affectedCompanyIds: dto.affectedCompanyIds ?? undefined,
      actionsTaken: dto.actionsTaken?.trim() || null, responsibleUserId: dto.responsibleUserId ?? currentUserId(), occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null, createdByUserId: currentUserId() } });
    await this.prisma.incidentEvent.create({ data: { incidentId: incident.id, userId: currentUserId(), note: 'Incidente registrado.', toStatus: 'OPEN' } });
    return this.incident(incident.id);
  }
  async updateIncident(id: string, dto: IncidentUpdateDto) {
    const incident = await this.prisma.securityIncident.findUnique({ where: { id } }); if (!incident) throw new NotFoundException('Incidente não encontrado.');
    if (dto.status && ORDER.indexOf(dto.status) < ORDER.indexOf(incident.status)) throw new BadRequestException('O status do incidente só avança (OPEN → INVESTIGATING → CONTAINED → RESOLVED → CLOSED).');
    if (dto.status === 'CLOSED' && !(dto.actionsTaken ?? incident.actionsTaken)?.trim()) throw new BadRequestException('Registre as ações tomadas antes de encerrar o incidente.');
    await this.prisma.securityIncident.update({ where: { id }, data: { ...(dto.status ? { status: dto.status } : {}), ...(dto.impact !== undefined ? { impact: dto.impact } : {}), ...(dto.affectedData !== undefined ? { affectedData: dto.affectedData } : {}),
      ...(dto.actionsTaken !== undefined ? { actionsTaken: dto.actionsTaken } : {}), ...(dto.responsibleUserId ? { responsibleUserId: dto.responsibleUserId } : {}),
      ...(dto.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}), ...(dto.status === 'CLOSED' ? { closedAt: new Date() } : {}) } });
    await this.prisma.incidentEvent.create({ data: { incidentId: id, userId: currentUserId(), note: dto.note.trim(), fromStatus: dto.status ? incident.status : null, toStatus: dto.status ?? null } });
    void currentRole; return this.incident(id);
  }
}
