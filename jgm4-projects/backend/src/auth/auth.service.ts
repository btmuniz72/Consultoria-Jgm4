import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { ActorUser, Role, currentRequestInfo, isRole } from '../approvals/authority';
import { COOKIE_NAME, accessTtl, bcryptCost, devActorEnabled, jwtSecret } from './auth.config';
import { sessionConfig } from '../security/config';
import { randomToken, sha256, csrfTokenFor, encryptSecret, decryptSecret } from '../security/crypto';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../security/totp';
import { validatePassword } from '../security/password-policy';
import { SecurityEventsService } from '../security/security-events.service';
import { MailService } from '../security/mail.service';

interface Claims { sub: string; sid: string; role: Role; companyId: string | null }
export interface SessionResult { kind: 'session'; user: ReturnType<AuthService['publicUser']>; accessToken: string; refreshToken: string; sessionId: string; csrf: string; restricted: ActorUser['restricted']; absoluteExpiresAt: Date; idleExpiresAt: Date }
export interface MfaChallenge { kind: 'mfa'; mfaToken: string }
const minutes = (n: number) => n * 60 * 1000; const hours = (n: number) => n * 3600 * 1000; const days = (n: number) => n * 86400 * 1000;
let dummyHash: Promise<string> | undefined;

type DbUser = Awaited<ReturnType<AuthService['loadUser']>>;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly events: SecurityEventsService, private readonly mail: MailService) {}

  loadUser(where: { id: string } | { email: string }) { return this.prisma.user.findUnique({ where, include: { company: { select: { id: true, name: true, active: true } } } }); }
  private usable(user: NonNullable<DbUser>) { return user.active && user.status === 'ACTIVE' && !(user.company && !user.company.active); }

  publicUser(user: { id: string; name: string; email: string; role: string; mfaEnabled?: boolean; mustChangePassword?: boolean; company?: { id: string; name: string } | null }) {
    return { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled ?? false, mustChangePassword: user.mustChangePassword ?? false, company: user.company ? { id: user.company.id, name: user.company.name } : null };
  }

  // ---------------------------------------------------------------- login
  async login(email: string, password: string): Promise<SessionResult | MfaChallenge> {
    const normalized = email.trim().toLowerCase(); const now = new Date();
    const user = await this.loadUser({ email: normalized });
    if (user?.lockedUntil && user.lockedUntil > now) throw new HttpException('Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.', 429);
    const stored = user?.passwordHash ?? await (dummyHash ??= hash('credencial-inexistente', bcryptCost()));
    const matches = await compare(password, stored);
    if (!user || !matches) {
      if (user) await this.registerFailure(user.id, 'senha');
      else await this.events.record('LOGIN_FAILED', { userId: null, metadata: { reason: 'desconhecido', emailHash: sha256(normalized).slice(0, 16) } });
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (!this.usable(user)) {
      await this.events.record('LOGIN_FAILED', { userId: user.id, metadata: { reason: `conta_${user.status.toLowerCase()}` } });
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (user.mfaEnabled) return { kind: 'mfa', mfaToken: sign({ sub: user.id, purpose: 'mfa' }, jwtSecret(), { algorithm: 'HS256', expiresIn: '5m', issuer: 'jgm4-projects' }) };
    return this.startSession(user);
  }

  private async registerFailure(userId: string, reason: string) {
    const cfg = sessionConfig();
    const user = await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
    await this.events.record('LOGIN_FAILED', { userId, metadata: { reason, attempts: user.failedLoginCount } });
    if (user.failedLoginCount >= cfg.lockThreshold) {
      await this.prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + minutes(cfg.lockMinutes)), failedLoginCount: 0 } });
      await this.events.record('ACCOUNT_LOCKED', { userId, metadata: { minutes: cfg.lockMinutes } });
    }
  }

  async verifyMfa(mfaToken: string, code: string): Promise<SessionResult> {
    let claims: { sub: string; purpose?: string };
    try { claims = verify(mfaToken, jwtSecret(), { algorithms: ['HS256'], issuer: 'jgm4-projects' }) as never; } catch { throw new UnauthorizedException('Verificação expirada. Entre novamente.'); }
    if (claims.purpose !== 'mfa') throw new UnauthorizedException('Verificação inválida.');
    const user = await this.loadUser({ id: claims.sub });
    if (!user || !this.usable(user) || !user.mfaEnabled || !user.mfaSecretEnc || (user.lockedUntil && user.lockedUntil > new Date())) throw new UnauthorizedException('Verificação inválida.');
    if (!verifyTotp(decryptSecret(user.mfaSecretEnc), code.trim())) {
      await this.events.record('MFA_FAILED', { userId: user.id });
      await this.registerFailure(user.id, 'mfa');
      throw new UnauthorizedException('Código de verificação inválido.');
    }
    return this.startSession(user);
  }

  private async startSession(user: NonNullable<DbUser>): Promise<SessionResult> {
    const cfg = sessionConfig(); const info = currentRequestInfo(); const now = Date.now();
    const adminWithoutMfa = cfg.requireMfaForAdmin && user.role === 'JGM4_ADMIN' && !user.mfaEnabled;
    const refreshToken = randomToken(32);
    const session = await this.prisma.authSession.create({ data: { userId: user.id, refreshHash: sha256(refreshToken), expiresAt: new Date(now + days(cfg.absoluteDays)), idleExpiresAt: new Date(now + hours(cfg.refreshIdleHours)),
      ip: info.ip ?? null, userAgent: info.userAgent ?? null, mfaPending: adminWithoutMfa } });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActivityAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await this.events.record('LOGIN_SUCCESS', { userId: user.id, metadata: { sessionId: session.id, mfa: user.mfaEnabled } });
    return this.result(user, session, refreshToken);
  }
  private result(user: NonNullable<DbUser>, session: { id: string; expiresAt: Date; idleExpiresAt: Date; mfaPending: boolean }, refreshToken: string): SessionResult {
    const claims: Claims = { sub: user.id, sid: session.id, role: user.role as Role, companyId: user.companyId };
    return { kind: 'session', user: this.publicUser(user), accessToken: sign(claims, jwtSecret(), { algorithm: 'HS256', expiresIn: accessTtl() as never, issuer: 'jgm4-projects' }), refreshToken, sessionId: session.id, csrf: csrfTokenFor(session.id),
      restricted: user.mustChangePassword ? 'PASSWORD_CHANGE_REQUIRED' : session.mfaPending ? 'MFA_SETUP_REQUIRED' : null, absoluteExpiresAt: session.expiresAt, idleExpiresAt: session.idleExpiresAt };
  }

  // ---------------------------------------------------------------- refresh (rotativo, com detecção de reuso)
  async refresh(refreshToken: string | null): Promise<SessionResult> {
    if (!refreshToken) throw new UnauthorizedException('Sessão inválida ou expirada.');
    const hashed = sha256(refreshToken); const now = new Date();
    const session = await this.prisma.authSession.findUnique({ where: { refreshHash: hashed } });
    if (!session) {
      const reused = await this.prisma.authSession.findFirst({ where: { previousRefreshHash: hashed, revokedAt: null } });
      if (reused) { await this.revoke(reused.id, 'refresh_reuse'); await this.events.record('SESSION_REFRESH_REUSE', { userId: reused.userId, metadata: { sessionId: reused.id } }); }
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    if (session.revokedAt || session.expiresAt <= now || session.idleExpiresAt <= now) throw new UnauthorizedException('Sessão inválida ou expirada.');
    const user = await this.loadUser({ id: session.userId });
    if (!user || !this.usable(user)) { await this.revoke(session.id, 'conta_indisponivel'); throw new UnauthorizedException('Sessão inválida ou expirada.'); }
    const cfg = sessionConfig(); const next = randomToken(32);
    const idle = new Date(Math.min(Date.now() + hours(cfg.refreshIdleHours), session.expiresAt.getTime()));
    const rotated = await this.prisma.authSession.updateMany({ where: { id: session.id, refreshHash: hashed, revokedAt: null }, data: { refreshHash: sha256(next), previousRefreshHash: hashed, lastUsedAt: now, idleExpiresAt: idle } });
    if (rotated.count !== 1) throw new UnauthorizedException('Sessão inválida ou expirada.');
    return this.result(user, { ...session, idleExpiresAt: idle }, next);
  }

  // ---------------------------------------------------------------- autenticação por requisição
  async authenticate(req: { headers: Record<string, unknown> }): Promise<ActorUser | null> {
    const { token, via } = this.tokenFrom(req);
    if (token) return this.fromToken(token, via!);
    return this.devActor(req);
  }
  private tokenFrom(req: { headers: Record<string, unknown> }): { token: string | null; via: 'cookie' | 'bearer' | null } {
    const authorization = req.headers['authorization'];
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) return { token: authorization.slice(7).trim(), via: 'bearer' };
    const cookies = req.headers['cookie'];
    if (typeof cookies !== 'string') return { token: null, via: null };
    for (const part of cookies.split(';')) { const [name, ...value] = part.trim().split('='); if (name === COOKIE_NAME) return { token: decodeURIComponent(value.join('=')), via: 'cookie' }; }
    return { token: null, via: null };
  }
  private async fromToken(token: string, via: 'cookie' | 'bearer'): Promise<ActorUser> {
    let claims: Claims;
    try { claims = verify(token, jwtSecret(), { algorithms: ['HS256'], issuer: 'jgm4-projects' }) as unknown as Claims; } catch { throw new UnauthorizedException('Sessão inválida ou expirada.'); }
    if (!claims.sid || (claims as unknown as { purpose?: string }).purpose) throw new UnauthorizedException('Sessão inválida ou expirada.');
    const session = await this.prisma.authSession.findUnique({ where: { id: claims.sid }, include: { user: { include: { company: { select: { id: true, name: true, active: true } } } } } });
    const now = new Date();
    // Perfil e empresa vêm SEMPRE do banco; a sessão precisa estar ativa (logout/revogação valem imediatamente).
    if (!session || session.revokedAt || session.expiresAt <= now || session.userId !== claims.sub || !this.usable(session.user) || !isRole(session.user.role)) throw new UnauthorizedException('Sessão inválida ou expirada.');
    if (now.getTime() - session.lastUsedAt.getTime() > 60000) { // atividade (sem escrever a cada requisição)
      void this.prisma.authSession.update({ where: { id: session.id }, data: { lastUsedAt: now } }).catch(() => undefined);
      void this.prisma.user.update({ where: { id: session.userId }, data: { lastActivityAt: now } }).catch(() => undefined);
    }
    const user = session.user;
    return { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId, sessionId: session.id, via,
      restricted: user.mustChangePassword ? 'PASSWORD_CHANGE_REQUIRED' : session.mfaPending ? 'MFA_SETUP_REQUIRED' : null };
  }
  private devActor(req: { headers: Record<string, unknown> }): ActorUser | null {
    if (!devActorEnabled()) return null;
    const header = req.headers['x-actor-role'];
    const role: Role = isRole(header) ? header : process.env.JGM4_LOCAL_ACTOR === 'CLIENT' ? 'CLIENT_SPONSOR' : 'JGM4_ADMIN';
    return { id: null, name: 'Ator de desenvolvimento', email: null, role, companyId: null, dev: true };
  }

  // ---------------------------------------------------------------- sessões
  async revoke(sessionId: string, reason: string, userId?: string) {
    const result = await this.prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null, ...(userId ? { userId } : {}) }, data: { revokedAt: new Date(), revokedReason: reason } });
    if (result.count) await this.events.record('SESSION_REVOKED', { userId: userId ?? undefined, metadata: { sessionId, reason } });
    return result.count;
  }
  async revokeAll(userId: string, reason: string, exceptSessionId?: string) {
    const result = await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) }, data: { revokedAt: new Date(), revokedReason: reason } });
    if (result.count) await this.events.record('SESSION_REVOKED', { userId, metadata: { all: true, reason, count: result.count } });
    return result.count;
  }
  /** Encerra a sessão de quem faz logout (mesmo com o access token já expirado), pelo token de acesso ou pelo refresh. */
  async logoutFromRequest(headers: Record<string, unknown>, refreshToken: string | null) {
    const { token } = this.tokenFrom({ headers }); let sessionId: string | undefined; let userId: string | undefined;
    if (token) { try { const claims = verify(token, jwtSecret(), { algorithms: ['HS256'], issuer: 'jgm4-projects', ignoreExpiration: true }) as unknown as Claims; sessionId = claims.sid; userId = claims.sub; } catch { /* token inválido: tenta o refresh */ } }
    if (!sessionId && refreshToken) { const session = await this.prisma.authSession.findUnique({ where: { refreshHash: sha256(refreshToken) }, select: { id: true, userId: true } }); sessionId = session?.id; userId = session?.userId; }
    if (sessionId) await this.revoke(sessionId, 'logout', userId);
  }
  async sessions(userId: string, currentSessionId?: string) {
    const rows = await this.prisma.authSession.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' } });
    return rows.map((row) => ({ id: row.id, current: row.id === currentSessionId, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, expiresAt: row.expiresAt, ip: row.ip, userAgent: row.userAgent }));
  }

  // ---------------------------------------------------------------- senha
  async changePassword(userId: string, current: string, next: string, currentSessionId?: string) {
    const user = await this.loadUser({ id: userId });
    if (!user || !(await compare(current, user.passwordHash))) { await this.events.record('REAUTH_FAILED', { userId, metadata: { action: 'change-password' } }); throw new UnauthorizedException('Senha atual incorreta.'); }
    const errors = validatePassword(next, user); if (errors.length) throw new BadRequestException({ message: errors, error: 'Bad Request', statusCode: 400 });
    if (await compare(next, user.passwordHash)) throw new BadRequestException('A nova senha deve ser diferente da atual.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(next, bcryptCost()), passwordChangedAt: new Date(), mustChangePassword: false } });
    await this.revokeAll(userId, 'senha_alterada', currentSessionId);
    await this.events.record('PASSWORD_CHANGED', { userId });
    await this.mail.send({ to: user.email, subject: 'Sua senha foi alterada', text: 'A senha da sua conta no JGM4 Projects foi alterada. Se não foi você, redefina a senha imediatamente e avise a JGM4.' });
  }

  /** Resposta sempre genérica (não revela se o e-mail existe). */
  async forgotPassword(email: string) {
    const user = await this.loadUser({ email: email.trim().toLowerCase() });
    if (!user || !this.usable(user)) return;
    await this.issueToken(user.id, user.email, 'RESET');
    await this.events.record('PASSWORD_RESET_REQUESTED', { userId: user.id });
  }
  /** Cria o token (hash no banco, uso único, expiração curta) e envia o link por e-mail. */
  async issueToken(userId: string, to: string, purpose: 'RESET' | 'SETUP'): Promise<string> {
    const cfg = sessionConfig(); const token = randomToken(32); const info = currentRequestInfo();
    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash: sha256(token), purpose, expiresAt: new Date(Date.now() + (purpose === 'SETUP' ? hours(cfg.setupHours) : minutes(cfg.resetMinutes))), requestedIp: info.ip ?? null } });
    const link = this.mail.resetLink(token);
    await this.mail.send(purpose === 'SETUP'
      ? { to, subject: 'Defina sua senha de acesso — JGM4 Projects', text: `Sua conta foi criada. Defina a senha pelo link (válido por ${cfg.setupHours} horas, uso único):\n${link}` }
      : { to, subject: 'Redefinição de senha — JGM4 Projects', text: `Recebemos um pedido para redefinir sua senha. Use o link (válido por ${cfg.resetMinutes} minutos, uso único):\n${link}\nSe não foi você, ignore este e-mail.` });
    return link;
  }
  async resetPassword(token: string, next: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new BadRequestException('Link inválido ou expirado. Solicite uma nova redefinição.');
    const errors = validatePassword(next, record.user); if (errors.length) throw new BadRequestException({ message: errors, error: 'Bad Request', statusCode: 400 });
    const claimed = await this.prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new BadRequestException('Link inválido ou expirado. Solicite uma nova redefinição.');
    await this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hash(next, bcryptCost()), passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } });
    await this.revokeAll(record.userId, 'senha_redefinida');
    await this.events.record('PASSWORD_RESET', { userId: record.userId, metadata: { purpose: record.purpose } });
    await this.mail.send({ to: record.user.email, subject: 'Sua senha foi redefinida', text: 'A senha da sua conta no JGM4 Projects foi redefinida. Se não foi você, avise a JGM4 imediatamente.' });
  }

  // ---------------------------------------------------------------- MFA (TOTP)
  async mfaSetup(userId: string) {
    const user = await this.loadUser({ id: userId }); if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) throw new ConflictException('A verificação em duas etapas já está ativa.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaPendingSecretEnc: encryptSecret(secret) } });
    return { secret, otpauthUri: otpauthUri(user.email, secret) };
  }
  async mfaEnable(userId: string, code: string) {
    const user = await this.loadUser({ id: userId }); if (!user?.mfaPendingSecretEnc) throw new BadRequestException('Inicie a configuração da verificação em duas etapas.');
    const secret = decryptSecret(user.mfaPendingSecretEnc);
    if (!verifyTotp(secret, code.trim())) { await this.events.record('MFA_FAILED', { userId, metadata: { step: 'enable' } }); throw new BadRequestException('Código inválido.'); }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaSecretEnc: encryptSecret(secret), mfaPendingSecretEnc: null } });
    await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { mfaPending: false } });
    await this.events.record('MFA_ENABLED', { userId });
  }
  async mfaDisable(userId: string, password: string, code: string) {
    await this.reauthenticate(userId, { password, mfaCode: code });
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null } });
    await this.events.record('MFA_DISABLED', { userId });
  }

  /** Confirmação adicional para ações críticas (cancelar projeto, remover usuário, alterar perfil administrativo). */
  async reauthenticate(userId: string, input: { password?: string; mfaCode?: string }) {
    const user = await this.loadUser({ id: userId });
    const ok = !!user && !!input.password && await compare(input.password, user.passwordHash)
      && (!user.mfaEnabled || (!!input.mfaCode && !!user.mfaSecretEnc && verifyTotp(decryptSecret(user.mfaSecretEnc), input.mfaCode.trim())));
    if (!ok) { await this.events.record('REAUTH_FAILED', { userId }); throw new ForbiddenException('Confirmação de senha (e código, quando ativo) inválida.'); }
  }
}
