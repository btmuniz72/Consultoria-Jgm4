import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { buildXlsx } from '../reports/xlsx-builder';
import { currentUser } from '../approvals/authority';
import { RateLimit } from '../security/rate-limiter';
import { SecurityEventsService } from '../security/security-events.service';
import { AccessReviewQuery, AdminService, AnonymizeDto, CreateUserDto, IncidentDto, IncidentUpdateDto, SecurityEventsQuery, UserRoleDto, UserStatusDto } from './admin.service';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AddMemberDto, MembersService, PatchMemberDto } from './members.service';

class UsersQuery { @IsOptional() @IsString() @MaxLength(80) q?: string; @IsOptional() @IsString() @MaxLength(40) companyId?: string; @IsOptional() @IsString() @MaxLength(30) role?: string; @IsOptional() @IsString() @MaxLength(20) status?: string }

// Administração: somente JGM4_ADMIN. Ações críticas (status, perfil, anonimização) exigem confirmação de senha (e MFA quando ativo).
@Controller('admin')
@Roles('JGM4_ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly events: SecurityEventsService) {}
  @Get('users') users(@Query() query: UsersQuery) { return this.admin.users(query); }
  @Post('users') createUser(@Body() dto: CreateUserDto) { return this.admin.createUser(dto); }
  @Patch('users/:id/status') status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserStatusDto) { return this.admin.setStatus(id, dto); }
  @Patch('users/:id/role') role(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserRoleDto) { return this.admin.setRole(id, dto); }
  @Post('users/:id/anonymize') @HttpCode(200) anonymize(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnonymizeDto) { return this.admin.anonymize(id, dto); }
  @Post('users/:id/revoke-sessions') @HttpCode(200) revoke(@Param('id', ParseUUIDPipe) id: string) { return this.admin.revokeSessions(id); }
  @Post('users/:id/unlock') @HttpCode(200) unlock(@Param('id', ParseUUIDPipe) id: string) { return this.admin.unlock(id); }

  @Get('access-review') accessReview(@Query() query: AccessReviewQuery) { return this.admin.accessReview(Number(query.inactiveDays) || 90); }
  @RateLimit('export', 30, 600) @Get('access-review/xlsx') async accessReviewXlsx(@Query() query: AccessReviewQuery, @Res() res: Response) {
    const rows = (await this.admin.accessReview(Number(query.inactiveDays) || 90)).map((user) => ({ name: user.name, email: user.email, company: user.company ?? 'JGM4', role: user.role, status: user.status, mfa: user.mfaEnabled ? 'Sim' : 'Não',
      lastLogin: user.lastLoginAt, lastActivity: user.lastActivityAt, projects: user.memberships.filter((m) => m.active).map((m) => `${m.project} (${m.roleInProject ?? '—'})`).join('; '), flags: user.flags.join('; ') }));
    const buffer = await buildXlsx(`JGM4 Projects — ${currentUser()?.name ?? 'sistema'}`, [{ name: 'Revisão de acessos', columns: [
      { header: 'Usuário', key: 'name', width: 26 }, { header: 'E-mail', key: 'email', width: 32 }, { header: 'Empresa', key: 'company', width: 24 }, { header: 'Perfil', key: 'role', width: 18 }, { header: 'Status', key: 'status', width: 12 }, { header: 'MFA', key: 'mfa', width: 8 },
      { header: 'Último login', key: 'lastLogin', width: 18, kind: 'datetime' }, { header: 'Última atividade', key: 'lastActivity', width: 18, kind: 'datetime' }, { header: 'Projetos e perfis', key: 'projects', width: 50 }, { header: 'Alertas', key: 'flags', width: 50 }], rows }]);
    await this.events.record('EXPORT_GENERATED', { metadata: { report: 'ACCESS_REVIEW', rows: rows.length } }); await this.events.record('SENSITIVE_DOWNLOAD', { metadata: { report: 'ACCESS_REVIEW' } });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="JGM4_Revisao_de_Acessos_${new Date().toISOString().slice(0, 10)}.xlsx"`, 'Cache-Control': 'private, no-store' }).send(buffer);
  }

  @Get('security-events') securityEvents(@Query() query: SecurityEventsQuery) { return this.events.list({ type: query.type, userId: query.userId, from: query.from, to: query.to, limit: Number(query.limit) || 100, offset: Number(query.offset) || 0 }); }

  @Get('incidents') incidents() { return this.admin.incidents(); }
  @Post('incidents') createIncident(@Body() dto: IncidentDto) { return this.admin.createIncident(dto); }
  @Get('incidents/:id') incident(@Param('id', ParseUUIDPipe) id: string) { return this.admin.incident(id); }
  @Patch('incidents/:id') updateIncident(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IncidentUpdateDto) { return this.admin.updateIncident(id, dto); }
}

// Vínculos do projeto. O ProjectAccessGuard valida o acesso ao :projectId; escrita só para o administrador.
@Controller('projects/:projectId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER') @Get() list(@Param('projectId', ParseUUIDPipe) id: string) { return this.members.list(id); }
  @Roles('JGM4_ADMIN') @Post() add(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) { return this.members.add(id, dto); }
  @Roles('JGM4_ADMIN') @Patch(':membershipId') patch(@Param('projectId', ParseUUIDPipe) id: string, @Param('membershipId', ParseUUIDPipe) membershipId: string, @Body() dto: PatchMemberDto) { return this.members.patch(id, membershipId, dto); }
}
