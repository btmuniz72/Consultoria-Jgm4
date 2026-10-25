import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { MfaChallenge, AuthService, SessionResult } from './auth.service';
import { COOKIE_NAME, CSRF_COOKIE, REFRESH_COOKIE, isProduction } from './auth.config';
import { Public } from './decorators';
import { currentUser } from '../approvals/authority';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit } from '../security/rate-limiter';
import { SecurityEventsService } from '../security/security-events.service';
import { privacyContactEmail, sessionConfig } from '../security/config';
import { apiBasePath } from '../security/config';

class LoginDto { @IsEmail() @MaxLength(254) email!: string; @IsString() @MinLength(1) @MaxLength(200) password!: string }
class MfaVerifyDto { @IsString() @MaxLength(2000) mfaToken!: string; @IsString() @MinLength(6) @MaxLength(8) code!: string }
class ForgotDto { @IsEmail() @MaxLength(254) email!: string }
class ResetDto { @IsString() @MinLength(20) @MaxLength(200) token!: string; @IsString() @MinLength(1) @MaxLength(200) password!: string }
class ChangePasswordDto { @IsString() @MaxLength(200) currentPassword!: string; @IsString() @MaxLength(200) newPassword!: string }
class MfaCodeDto { @IsString() @MinLength(6) @MaxLength(8) code!: string }
class MfaDisableDto { @IsString() @MaxLength(200) password!: string; @IsOptional() @IsString() @MaxLength(8) code?: string }

const base = () => ({ sameSite: 'strict' as const, secure: isProduction() });
function setSessionCookies(res: Response, result: SessionResult) {
  const cfg = sessionConfig();
  res.cookie(COOKIE_NAME, result.accessToken, { ...base(), httpOnly: true, path: apiBasePath(), maxAge: cfg.accessMinutes * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...base(), httpOnly: true, path: `${apiBasePath()}/auth`, maxAge: Math.max(1000, result.idleExpiresAt.getTime() - Date.now()) });
  res.cookie(CSRF_COOKIE, result.csrf, { ...base(), httpOnly: false, path: '/', maxAge: Math.max(1000, result.absoluteExpiresAt.getTime() - Date.now()) });
}
function clearSessionCookies(res: Response) {
  res.clearCookie(COOKIE_NAME, { ...base(), httpOnly: true, path: apiBasePath() }); res.clearCookie(REFRESH_COOKIE, { ...base(), httpOnly: true, path: `${apiBasePath()}/auth` }); res.clearCookie(CSRF_COOKIE, { ...base(), httpOnly: false, path: '/' });
}
const refreshCookie = (req: Request) => { const header = req.headers.cookie; if (!header) return null; for (const part of header.split(';')) { const [name, ...value] = part.trim().split('='); if (name === REFRESH_COOKIE) return decodeURIComponent(value.join('=')); } return null; };

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService, private readonly events: SecurityEventsService) {}

  /** Endpoints públicos que dependem de cookie exigem cabeçalho personalizado (força preflight CORS; um site de terceiros não consegue enviá-lo). */
  private async requireAjax(req: Request) {
    if (!req.headers['x-requested-with']) { await this.events.record('CSRF_REJECTED', { userId: null, metadata: { route: req.path } }); throw new ForbiddenException('Requisição não autorizada.'); }
  }
  private respond(res: Response, result: SessionResult | MfaChallenge) {
    if (result.kind === 'mfa') return { mfaRequired: true, mfaToken: result.mfaToken };
    setSessionCookies(res, result);
    return { accessToken: result.accessToken, user: result.user, restricted: result.restricted };
  }

  @Public() @RateLimit('login', 60, 600) @Post('auth/login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) { return this.respond(res, await this.auth.login(dto.email, dto.password)); }

  @Public() @RateLimit('mfa', 15, 600) @Post('auth/mfa/verify') @HttpCode(200)
  async mfaVerify(@Body() dto: MfaVerifyDto, @Res({ passthrough: true }) res: Response) { return this.respond(res, await this.auth.verifyMfa(dto.mfaToken, dto.code)); }

  @Public() @RateLimit('refresh', 120, 600) @Post('auth/refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.requireAjax(req);
    try { return this.respond(res, await this.auth.refresh(refreshCookie(req))); } catch (error) { clearSessionCookies(res); throw error; }
  }

  @Public() @Post('auth/logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.requireAjax(req);
    await this.auth.logoutFromRequest(req.headers, refreshCookie(req));
    clearSessionCookies(res);
  }

  @Get('auth/me')
  async me() {
    const actor = currentUser()!;
    if (!actor.id) return { id: null, name: actor.name, email: null, role: actor.role, company: null, dev: true, projects: [], restricted: null };
    const user = await this.auth.loadUser({ id: actor.id });
    const memberships = await this.prisma.projectMembership.findMany({ where: { userId: actor.id, active: true }, select: { projectId: true } });
    return { ...this.auth.publicUser(user!), projects: memberships.map((item) => item.projectId), restricted: actor.restricted ?? null };
  }

  @Public() @RateLimit('forgot', 10, 3600) @Post('auth/forgot') @HttpCode(202)
  async forgot(@Body() dto: ForgotDto) { await this.auth.forgotPassword(dto.email); return { message: 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.' }; }

  @Public() @RateLimit('reset', 20, 3600) @Post('auth/reset') @HttpCode(200)
  async reset(@Body() dto: ResetDto) { await this.auth.resetPassword(dto.token, dto.password); return { message: 'Senha redefinida. Entre com a nova senha.' }; }

  @Post('auth/change-password') @HttpCode(200)
  async changePassword(@Body() dto: ChangePasswordDto) { const actor = currentUser()!; await this.auth.changePassword(actor.id!, dto.currentPassword, dto.newPassword, actor.sessionId); return { message: 'Senha alterada. As demais sessões foram encerradas.' }; }

  @Get('auth/sessions') sessions() { const actor = currentUser()!; return this.auth.sessions(actor.id!, actor.sessionId); }
  @Delete('auth/sessions/:id') @HttpCode(204) async revokeSession(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const actor = currentUser()!; await this.auth.revoke(id, 'revogada_pelo_usuario', actor.id!); if (id === actor.sessionId) clearSessionCookies(res);
  }
  @Post('auth/logout-all') @HttpCode(200) async logoutAll(@Res({ passthrough: true }) res: Response) { const actor = currentUser()!; const count = await this.auth.revokeAll(actor.id!, 'logout_geral'); clearSessionCookies(res); return { revoked: count }; }

  @Post('auth/mfa/setup') mfaSetup() { return this.auth.mfaSetup(currentUser()!.id!); }
  @Post('auth/mfa/enable') @HttpCode(200) async mfaEnable(@Body() dto: MfaCodeDto) { await this.auth.mfaEnable(currentUser()!.id!, dto.code); return { enabled: true }; }
  @Post('auth/mfa/disable') @HttpCode(200) async mfaDisable(@Body() dto: MfaDisableDto) { await this.auth.mfaDisable(currentUser()!.id!, dto.password, dto.code ?? ''); return { enabled: false }; }

  /** Configuração pública mínima (nenhum segredo): o contato de privacidade só aparece se configurado. */
  @Public() @Get('public-config') publicConfig() { const email = privacyContactEmail(); return { privacyContactEmail: email ?? null }; }
}
