import { ArgumentsHost, Catch, ExceptionFilter, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { currentUser } from '../approvals/authority';
import { redact, redactString } from './redact';
import { SecurityEventsService } from './security-events.service';

/**
 * Nenhum stack trace, mensagem de banco ou detalhe interno chega ao usuário (nem fora de produção). Erros inesperados são
 * registrados internamente já sanitizados; 403 gera evento de segurança ACCESS_DENIED.
 */
@Catch()
@Injectable()
export class SecureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');
  constructor(private readonly events: SecurityEventsService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(); const response = http.getResponse<Response>(); const request = http.getRequest<Request>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (exception instanceof ForbiddenException && !(request.route?.path ?? '').startsWith('/api/auth/csrf')) {
        const actor = currentUser();
        await this.events.record('ACCESS_DENIED', { userId: actor?.id ?? null, metadata: { method: request.method, route: request.route?.path ?? request.path, reason: redactString(String(exception.message)).slice(0, 200) } });
      }
      const body = exception.getResponse();
      response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }
    const error = exception as Error;
    this.logger.error(`${request.method} ${request.route?.path ?? request.path} -> ${redactString(error?.message ?? 'erro desconhecido')}`, redact({ name: error?.name }) as never);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Erro interno. Tente novamente; se persistir, contate o suporte.' });
  }
}

/** Log de requisições (método, rota, status, duração, usuário). Nunca registra corpo, cabeçalhos, cookies ou query string. */
export function requestLogger() {
  const logger = new Logger('Request');
  return (request: Request, response: Response, next: () => void) => {
    if (process.env.REQUEST_LOG !== 'true' && process.env.NODE_ENV !== 'production') return next();
    const started = Date.now();
    response.on('finish', () => { if (!request.path.startsWith('/api/health')) logger.log(`${request.method} ${request.route?.path ?? request.path} ${response.statusCode} ${Date.now() - started}ms user=${currentUser()?.id ?? '-'}`); });
    next();
  };
}
