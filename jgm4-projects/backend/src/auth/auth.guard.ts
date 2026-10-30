import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorUser, Role, setCurrentUser } from '../approvals/authority';
import { AccessService, hasGlobalAccess, isUuid } from './access.service';
import { AuthService } from './auth.service';
import { IS_PUBLIC, ROLES_KEY } from './decorators';
import { CSRF_HEADER } from './auth.config';
import { csrfTokenFor, safeEqual } from '../security/crypto';
import { SecurityEventsService } from '../security/security-events.service';

type Req = { headers: Record<string, unknown>; params: Record<string, string>; route?: { path?: string }; user?: ActorUser; method: string; originalUrl?: string; url?: string };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 1º guard global: autenticação (401) e perfis permitidos da rota (@Roles → 403). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService, private readonly events: SecurityEventsService) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest<Req>();
    const user = await this.auth.authenticate(req);
    if (!user) throw new UnauthorizedException('Autenticação necessária.');
    req.user = user; setCurrentUser(user);
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    // Sessão com pendência obrigatória (trocar a senha / ativar MFA) só acessa /api/auth/*.
    if (user.restricted && !path.startsWith('/api/auth')) throw new HttpException({ statusCode: 403, code: user.restricted, message: user.restricted === 'MFA_SETUP_REQUIRED' ? 'Ative a verificação em duas etapas para continuar.' : 'Troque a senha para continuar.' }, 403);
    // CSRF: sessão em cookie + método que altera estado exige o token por cabeçalho (o atacante cross-site não consegue lê-lo). Bearer não usa cookie, logo não é afetado.
    if (user.via === 'cookie' && user.sessionId && !SAFE_METHODS.has(req.method)) {
      const header = req.headers[CSRF_HEADER];
      if (typeof header !== 'string' || !safeEqual(header, csrfTokenFor(user.sessionId))) {
        await this.events.record('CSRF_REJECTED', { userId: user.id, metadata: { method: req.method, route: req.route?.path ?? path } });
        throw new HttpException({ statusCode: 403, message: 'Token CSRF ausente ou inválido.', error: 'Forbidden' }, 403);
      }
    }
    // Diretoria (CLIENT_EXECUTIVE) é somente leitura: nenhuma rota que altera estado, exceto a conta pessoal (/api/auth/*).
    if (user.role === 'CLIENT_EXECUTIVE' && !SAFE_METHODS.has(req.method) && !path.startsWith('/api/auth')) throw new ForbiddenException('O perfil de diretoria é somente leitura.');
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException(`O perfil ${user.role} não pode executar esta ação.`);
    return true;
  }
}

/**
 * 2º guard global: isolamento por projeto (tenant). Descobre o projeto da rota — direto (`:projectId`,
 * `/projects/:id`) ou pela entidade (`:taskId`, `:gateId`, `/approvals/:id`) — e exige vínculo ativo.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: AccessService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<Req>(); const user = req.user;
    if (!user) throw new UnauthorizedException('Autenticação necessária.');
    if (user.dev) return true;
    const path = req.route?.path ?? ''; const p = req.params ?? {};
    let source: 'project' | 'task' | 'gate' | 'approval' | undefined; let rawId: string | undefined;
    if (p['projectId']) { source = 'project'; rawId = p['projectId']; }
    else if (path.includes('/projects/:id')) { source = 'project'; rawId = p['id']; }
    else if (p['taskId']) { source = 'task'; rawId = p['taskId']; }
    else if (p['gateId']) { source = 'gate'; rawId = p['gateId']; }
    else if (path.includes('/approvals/:id')) { source = 'approval'; rawId = p['id']; }
    if (!source) return true; // rota sem projeto no caminho (listas são filtradas no serviço)
    if (!isUuid(rawId)) { if (hasGlobalAccess(user)) return true; throw new BadRequestException('Identificador inválido.'); }
    const projectId = source === 'project' ? rawId : await this.access.projectOf(source, rawId);
    // Entidade inexistente: o administrador segue (o serviço responde 404); os demais não descobrem nada.
    if (!projectId) { if (hasGlobalAccess(user)) return true; throw new ForbiddenException('Você não tem acesso a este recurso.'); }
    await this.access.assertProject(user, projectId);
    return true;
  }
}
