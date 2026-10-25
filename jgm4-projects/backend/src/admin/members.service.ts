import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { currentRole, currentUserId, isJgm4Role } from '../approvals/authority';
import { assertProjectOpen } from '../projects/project-guard';

export class AddMemberDto { @IsUUID() userId!: string; @IsOptional() @IsString() @MaxLength(80) roleInProject?: string }
export class PatchMemberDto {
  @IsOptional() @IsBoolean() active?: boolean; @IsOptional() @IsString() @MaxLength(80) roleInProject?: string;
  @IsOptional() @IsString() @MaxLength(200) confirmPassword?: string; @IsOptional() @IsString() @MaxLength(8) mfaCode?: string;
}

// Administração de vínculos usuário↔projeto (JGM4_ADMIN). Tudo é auditado; remover vínculo exige confirmação de senha (e MFA quando ativo).
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  async list(projectId: string) {
    const admin = currentRole() === 'JGM4_ADMIN';
    const rows = await this.prisma.projectMembership.findMany({ where: { projectId, ...(admin ? {} : { active: true }), user: { status: 'ACTIVE' } }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, email: true, role: true, company: { select: { name: true } } } } } });
    return rows.map((row) => ({ membershipId: row.id, userId: row.userId, name: row.user.name, role: row.user.role, company: row.user.company?.name ?? null, roleInProject: row.roleInProject, active: row.active, ...(admin ? { email: row.user.email } : {}) }));
  }

  async add(projectId: string, dto: AddMemberDto) {
    await assertProjectOpen(this.prisma, projectId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, company: { active: true } }, select: { id: true, companyId: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || user.status !== 'ACTIVE' || !user.active) throw new NotFoundException('Usuário não encontrado ou inativo.');
    if (!isJgm4Role(user.role as never) && user.companyId !== project.companyId) throw new ForbiddenException('Usuário do cliente só pode ser vinculado a projetos da própria empresa.');
    const existing = await this.prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: dto.userId } } });
    if (existing?.active) throw new ConflictException('O usuário já está vinculado a este projeto.');
    const membership = existing
      ? await this.prisma.projectMembership.update({ where: { id: existing.id }, data: { active: true, roleInProject: dto.roleInProject ?? existing.roleInProject } })
      : await this.prisma.projectMembership.create({ data: { projectId, userId: dto.userId, roleInProject: dto.roleInProject ?? user.role } });
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'ProjectMembership', entityId: membership.id, action: existing ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_ADDED', actorType: currentRole(),
      newValue: { targetUserId: user.id, name: user.name, role: user.role, roleInProject: membership.roleInProject } } });
    return { membershipId: membership.id, userId: user.id, active: true };
  }

  async patch(projectId: string, membershipId: string, dto: PatchMemberDto) {
    await assertProjectOpen(this.prisma, projectId);
    const membership = await this.prisma.projectMembership.findFirst({ where: { id: membershipId, projectId }, include: { user: { select: { name: true, role: true } } } });
    if (!membership) throw new NotFoundException('Vínculo não encontrado neste projeto.');
    if (dto.active === false && membership.active) await this.auth.reauthenticate(currentUserId()!, { password: dto.confirmPassword, mfaCode: dto.mfaCode });
    const data = { ...(dto.active !== undefined ? { active: dto.active } : {}), ...(dto.roleInProject !== undefined ? { roleInProject: dto.roleInProject } : {}) };
    if (!Object.keys(data).length) throw new ConflictException('Nada a alterar.');
    const updated = await this.prisma.projectMembership.update({ where: { id: membershipId }, data });
    const action = dto.active === false && membership.active ? 'MEMBERSHIP_DEACTIVATED' : dto.active === true && !membership.active ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_UPDATED';
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: 'ProjectMembership', entityId: membershipId, action, actorType: currentRole(),
      oldValue: { active: membership.active, roleInProject: membership.roleInProject }, newValue: { targetUserId: membership.userId, name: membership.user.name, active: updated.active, roleInProject: updated.roleInProject } } });
    return { membershipId, active: updated.active, roleInProject: updated.roleInProject };
  }
}
