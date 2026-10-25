import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { allowedOrigins, apiBasePath, isProduction, publicBasePath, publicUrl } from './config';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
// SPA Angular: scripts só do próprio domínio; estilos inline são usados pelo Angular; sem iframes; conexões só para a própria origem.
const APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';

/** Origem permitida? (Sem cabeçalho Origin = cliente não-navegador; as proteções de sessão cuidam do resto.) */
export const originAllowed = (origin: string | undefined) => !origin || allowedOrigins().includes(origin);

/** Cabeçalhos de segurança + CSP por tipo de resposta (API x aplicação) + Permissions-Policy. HSTS apenas em produção (HTTPS). */
export function securityHeaders() {
  const base = helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, hsts: isProduction() ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false, referrerPolicy: { policy: 'no-referrer' }, frameguard: { action: 'deny' } });
  return (req: Request, res: Response, next: NextFunction) => {
    const apiPath = apiBasePath();
    res.setHeader('Content-Security-Policy', req.path === apiPath || req.path.startsWith(`${apiPath}/`) ? API_CSP : APP_CSP);
    res.setHeader('Permissions-Policy', PERMISSIONS);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    base(req, res, next);
  };
}

/** Produção só em HTTPS: redireciona HTTP (atrás de proxy, via X-Forwarded-Proto) — exceto sondas de saúde. */
export function httpsOnly() {
  return (req: Request, res: Response, next: NextFunction) => {
    const healthPath = `${apiBasePath()}/health`;
    if (!isProduction() || req.secure || req.path === healthPath || req.path.startsWith(`${healthPath}/`)) return next();
    res.redirect(308, new URL(req.originalUrl, publicUrl()).toString());
  };
}

/** CSRF (defesa em profundidade): requisição que altera estado vinda de origem não autorizada é recusada, mesmo com cookie válido. */
export function originCheck(onReject: (req: Request) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (SAFE.has(req.method) || originAllowed(typeof origin === 'string' ? origin : undefined)) return next();
    onReject(req);
    res.status(403).json({ statusCode: 403, message: 'Origem não autorizada.', error: 'Forbidden' });
  };
}

export function corsOptions() {
  return { origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => callback(null, originAllowed(origin)), credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'], maxAge: 600 };
}

/** Hospedagem opcional do frontend (arquitetura simples, mesma origem: app e /api no mesmo domínio). */
export function serveFrontend(app: INestApplication, dir = process.env.FRONTEND_DIST_DIR) {
  if (!dir) return false;
  const root = resolve(dir); if (!existsSync(resolve(root, 'index.html'))) return false;
  const express = app as NestExpressApplication;
  const basePath = publicBasePath() === '/' ? '/' : `${publicBasePath()}/`;
  const staticOptions = { index: false, maxAge: '1h', setHeaders: (response: Response) => { response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); } };
  express.useStaticAssets(root, { ...staticOptions, ...(basePath === '/' ? {} : { prefix: basePath }) });
  express.use((req: Request, res: Response, next: NextFunction) => {
    const apiPath = apiBasePath();
    if (req.method !== 'GET' || req.path === apiPath || req.path.startsWith(`${apiPath}/`)) return next();
    if (basePath !== '/' && req.path === basePath.slice(0, -1)) return res.redirect(308, basePath);
    if (basePath !== '/' && req.path !== basePath.slice(0, -1) && !req.path.startsWith(basePath)) return next();
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-cache'); res.sendFile(resolve(root, 'index.html'));
  });
  return true;
}
