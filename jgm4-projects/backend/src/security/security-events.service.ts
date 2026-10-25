import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentRequestInfo, currentUserId } from '../approvals/authority';
import { redact } from './redact';

// Eventos de segurança (não são o AuditLog de negócio). Gravados sem senha, token ou segredo; falha ao registrar nunca derruba a requisição.
export type SecurityEventType = 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'ACCOUNT_LOCKED' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET' | 'SESSION_REVOKED' | 'SESSION_REFRESH_REUSE'
  | 'ACCESS_DENIED' | 'MFA_FAILED' | 'MFA_ENABLED' | 'MFA_DISABLED' | 'EXPORT_GENERATED' | 'SENSITIVE_DOWNLOAD' | 'RATE_LIMITED' | 'CSRF_REJECTED' | 'USER_STATUS_CHANGED' | 'USER_ANONYMIZED' | 'USER_CREATED'
  | 'ATTACHMENT_UPLOADED' | 'ATTACHMENT_REJECTED' | 'REAUTH_FAILED' | 'USER_ROLE_CHANGED' | 'ADMIN_ACCESS_RESET' | 'MEMBERSHIP_CHANGED' | 'COMPANY_STATUS_CHANGED' | 'PROJECT_CREATED';

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger('SecurityEvent');
  constructor(private readonly prisma: PrismaService) {}

  async record(type: SecurityEventType, input: { userId?: string | null; projectId?: string | null; metadata?: Record<string, unknown> } = {}) {
    try {
      const info = currentRequestInfo();
      await this.prisma.securityEvent.create({ data: { type, userId: input.userId === undefined ? currentUserId() : input.userId, projectId: input.projectId ?? null, ip: info.ip ?? null, userAgent: info.userAgent ?? null,
        metadata: (input.metadata ? redact(input.metadata) : undefined) as never } });
    } catch (error) { this.logger.error(`Falha ao registrar ${type}: ${(redact(error) as { message: string }).message}`); }
  }

  /** Consulta administrativa com filtros (tipo, usuário, período). */
  async list(filters: { type?: string; userId?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const where = { ...(filters.type ? { type: filters.type } : {}), ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: new Date(`${filters.from.slice(0, 10)}T00:00:00.000Z`) } : {}), ...(filters.to ? { lte: new Date(`${filters.to.slice(0, 10)}T23:59:59.999Z`) } : {}) } } : {}) };
    const [total, items] = await Promise.all([this.prisma.securityEvent.count({ where }),
      this.prisma.securityEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: filters.offset ?? 0, take: Math.min(filters.limit ?? 100, 500), include: { user: { select: { name: true, email: true } } } })]);
    return { total, items: items.map((event) => ({ id: event.id, type: event.type, at: event.createdAt, userId: event.userId, user: event.user?.name ?? null, ip: event.ip, userAgent: event.userAgent, projectId: event.projectId, metadata: event.metadata })) };
  }
}
