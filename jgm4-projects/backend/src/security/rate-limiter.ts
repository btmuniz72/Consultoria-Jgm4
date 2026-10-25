import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentRequestInfo, currentUserId } from '../approvals/authority';
import { sha256 } from './crypto';
import { SecurityEventsService } from './security-events.service';

const KEY = 'security:ratelimit';
/** Limita a taxa do endpoint por IP (ou por usuário autenticado). Persistente no PostgreSQL: vale entre instâncias e reinícios. */
export const RateLimit = (bucket: string, limit: number, windowSeconds: number) => SetMetadata(KEY, { bucket, limit, windowSeconds });

// SQL bruto precisa do esquema explícito: o adaptador qualifica as consultas do ORM, mas não altera o search_path.
function bucketTable() {
  const schema = new URL(process.env.DATABASE_URL ?? 'postgresql://x/y').searchParams.get('schema') || 'public';
  if (!/^[A-Za-z0-9_]+$/.test(schema)) throw new Error('Esquema inválido.');
  return Prisma.raw(`"${schema}"."RateLimitBucket"`);
}

@Injectable()
export class RateLimiter {
  constructor(private readonly prisma: PrismaService) {}
  /** Registra uma tentativa; `allowed=false` quando passou do limite dentro da janela (janela fixa, atômico no banco). */
  async hit(key: string, limit: number, windowSeconds: number) {
    const hashed = key.length > 120 ? sha256(key) : key; const table = bucketTable();
    const rows = await this.prisma.$queryRaw<{ count: number; retryAfter: number }[]>`
      INSERT INTO ${table} AS b ("key", "windowStart", "count") VALUES (${hashed}, now(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "windowStart" = CASE WHEN b."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE b."windowStart" END,
        "count" = CASE WHEN b."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE b."count" + 1 END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM (b."windowStart" + make_interval(secs => ${windowSeconds}) - now()))))::int AS "retryAfter"`;
    const { count, retryAfter } = rows[0]; // tempo restante calculado no banco (sem depender de fuso horário do servidor)
    return { allowed: count <= limit, count, remaining: Math.max(0, limit - count), retryAfter };
  }
  async reset(key: string) { await this.prisma.rateLimitBucket.deleteMany({ where: { key: key.length > 120 ? sha256(key) : key } }); }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly limiter: RateLimiter, private readonly events: SecurityEventsService) {}
  async canActivate(context: ExecutionContext) {
    const config = this.reflector.getAllAndOverride<{ bucket: string; limit: number; windowSeconds: number } | undefined>(KEY, [context.getHandler(), context.getClass()]);
    if (!config) return true;
    const limit = config.bucket === 'login' ? Number(process.env.RATE_LIMIT_LOGIN_PER_IP) || config.limit : config.limit; // ajustável por ambiente (ex.: NAT corporativo)
    const subject = currentUserId() ?? currentRequestInfo().ip ?? 'desconhecido';
    const result = await this.limiter.hit(`${config.bucket}:${subject}`, limit, config.windowSeconds);
    if (result.allowed) return true;
    await this.events.record('RATE_LIMITED', { metadata: { bucket: config.bucket, limit } });
    throw new HttpException({ statusCode: 429, message: 'Muitas requisições. Aguarde um instante e tente novamente.', retryAfter: result.retryAfter }, 429);
  }
}
