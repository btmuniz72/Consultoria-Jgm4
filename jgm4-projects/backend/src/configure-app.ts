import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { actorMiddleware } from './approvals/authority';
import { jwtSecret } from './auth/auth.config';
import { assertProductionConfig, isProduction } from './security/config';
import { corsOptions, httpsOnly, originCheck, securityHeaders } from './security/http-security';
import { requestLogger } from './security/exception.filter';
import { SecurityEventsService } from './security/security-events.service';

export function configureApp(app: INestApplication) {
  // Produção/staging: recusa iniciar com configuração insegura (segredos, HTTPS, CORS, TLS do banco, e-mail, etc.).
  if (isProduction()) assertProductionConfig(); else jwtSecret();
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  if (process.env.TRUST_PROXY) express.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  app.setGlobalPrefix('api');
  app.use(actorMiddleware);
  app.use(httpsOnly());
  app.use(securityHeaders());
  app.use(requestLogger());
  app.use(originCheck((request) => { void app.get(SecurityEventsService, { strict: false }).record('CSRF_REJECTED', { userId: null, metadata: { reason: 'origem_nao_autorizada', method: request.method, route: request.path } }); }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors(corsOptions());
  app.enableShutdownHooks();
}
