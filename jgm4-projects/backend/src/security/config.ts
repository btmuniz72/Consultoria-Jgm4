// Configuração de segurança lida do ambiente a cada uso (permite testar variações sem reiniciar). Nenhum segredo tem valor padrão
// utilizável em produção: `validateProductionConfig` lista tudo o que falta e a API recusa iniciar com NODE_ENV=production.
export type AppEnv = 'development' | 'test' | 'staging' | 'production';
export const isProduction = () => process.env.NODE_ENV === 'production';
export const appEnv = (): AppEnv => {
  const declared = process.env.APP_ENV as AppEnv | undefined;
  if (declared && ['development', 'test', 'staging', 'production'].includes(declared)) return declared;
  return isProduction() ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';
};
const int = (name: string, fallback: number) => { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback; };

export const sessionConfig = () => ({
  accessMinutes: int('ACCESS_TTL_MIN', 15),           // access token curto
  refreshIdleHours: int('REFRESH_IDLE_HOURS', 12),    // sessão expira por inatividade
  absoluteDays: int('SESSION_ABSOLUTE_DAYS', 7),      // e, no máximo, após este prazo
  resetMinutes: int('RESET_TTL_MIN', 30), setupHours: int('SETUP_TTL_HOURS', 24),
  lockThreshold: int('LOCK_THRESHOLD', 5), lockMinutes: int('LOCK_MINUTES', 15),
  requireMfaForAdmin: process.env.REQUIRE_MFA_FOR_ADMIN === 'true' || (isProduction() && process.env.REQUIRE_MFA_FOR_ADMIN !== 'false'),
});
export const uploadConfig = () => ({ maxBytes: int('UPLOAD_MAX_MB', 10) * 1024 * 1024 });
export const retentionConfig = () => ({
  securityEventDays: int('RETENTION_SECURITY_EVENT_DAYS', 365), ipAnonymizeDays: int('RETENTION_IP_DAYS', 90), sessionDays: int('RETENTION_SESSION_DAYS', 30),
  resetTokenDays: int('RETENTION_RESET_TOKEN_DAYS', 7), rateLimitDays: int('RETENTION_RATE_LIMIT_DAYS', 1), reportLogDays: int('RETENTION_REPORT_LOG_DAYS', 1825),
});

const split = (value: string | undefined) => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
/** Origens autorizadas (CORS/Origin). Em produção vêm só de ALLOWED_ORIGINS; fora dela, também o front local. */
export function allowedOrigins(): string[] {
  const configured = split(process.env.ALLOWED_ORIGINS).filter((origin) => origin !== '*');
  if (isProduction()) return configured;
  return [...new Set([...configured, process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', 'http://localhost:4200', 'http://127.0.0.1:4200'])];
}
const normalizePath = (value: string, name: string) => {
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('?') || path.includes('#') || path.includes('\\')) throw new Error(`${name} deve ser um caminho absoluto, como /projetos ou /api.`);
  return path === '/' ? '/' : `/${path.split('/').filter(Boolean).join('/')}`;
};
export const publicBasePath = () => normalizePath(process.env.PUBLIC_BASE_PATH ?? process.env.FRONTEND_BASE_PATH ?? '/projetos', 'PUBLIC_BASE_PATH');
export const apiBasePath = () => normalizePath(process.env.API_BASE_PATH ?? '/api', 'API_BASE_PATH');
export const publicAppUrl = () => {
  const configured = process.env.PUBLIC_APP_URL ?? process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const origin = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200').replace(/\/+$/, '');
  return `${origin}${publicBasePath()}`;
};
/** Alias legado enquanto instalações antigas migram de PUBLIC_URL para PUBLIC_APP_URL. */
export const publicUrl = publicAppUrl;
export const privacyContactEmail = () => (process.env.PRIVACY_CONTACT_EMAIL?.trim() || undefined);

const PLACEHOLDER = /troque|change|example|exemplo|senha|password|secret(?:o)?$/i;
/** Erros de configuração que impedem a inicialização em produção/staging (lista vazia = ok). */
export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];
  const secret = env.JWT_SECRET ?? '';
  if (secret.length < 32 || PLACEHOLDER.test(secret)) errors.push('JWT_SECRET ausente, curto (< 32) ou com valor de exemplo.');
  const key = env.DATA_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(key) && Buffer.from(key, 'base64').length !== 32) errors.push('DATA_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hexadecimais ou base64).');
  const appUrl = env.PUBLIC_APP_URL ?? env.PUBLIC_URL ?? '';
  if (!/^https:\/\//i.test(appUrl)) errors.push('PUBLIC_APP_URL deve ser uma URL https (produção funciona somente com HTTPS).');
  try {
    const basePath = normalizePath(env.PUBLIC_BASE_PATH ?? env.FRONTEND_BASE_PATH ?? '/projetos', 'PUBLIC_BASE_PATH');
    const appPath = new URL(appUrl).pathname.replace(/\/+$/, '') || '/';
    if (appPath !== basePath) errors.push('PUBLIC_APP_URL deve terminar no caminho definido em PUBLIC_BASE_PATH.');
  } catch { errors.push('PUBLIC_BASE_PATH inválido.'); }
  try { normalizePath(env.API_BASE_PATH ?? '/api', 'API_BASE_PATH'); } catch { errors.push('API_BASE_PATH inválido.'); }
  const origins = split(env.ALLOWED_ORIGINS);
  if (!origins.length) errors.push('ALLOWED_ORIGINS deve listar os domínios autorizados.');
  if (origins.some((origin) => origin === '*' || !/^https:\/\//i.test(origin))) errors.push('ALLOWED_ORIGINS não pode conter "*" nem origens sem https.');
  const database = env.DATABASE_URL ?? '';
  if (!database) errors.push('DATABASE_URL ausente.');
  else if (!/sslmode=(require|verify-ca|verify-full)/i.test(database) && env.DATABASE_SSL !== 'require') errors.push('A conexão com o banco deve usar TLS (sslmode=require|verify-full na DATABASE_URL ou DATABASE_SSL=require).');
  // Atrás do Apache, req.secure, IP de auditoria e cookies Secure dependem de TRUST_PROXY; confiança ampla (true/*/all) deixaria qualquer cliente forjar X-Forwarded-*.
  const trust = (env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (!trust || trust === '0' || trust === 'false') errors.push('TRUST_PROXY deve declarar os proxies confiáveis (ex.: 1 para uma camada Apache); sem isso o HTTPS e o IP de auditoria não são reconhecidos atrás do proxy.');
  else if (['true', '*', 'all'].includes(trust) || (/^\d+$/.test(trust) && Number(trust) > 3)) errors.push('TRUST_PROXY muito amplo: use o número exato de saltos confiáveis (ex.: 1) ou os endereços do proxy, nunca qualquer origem.');
  if (env.ALLOW_DEV_ACTOR_HEADER === 'true') errors.push('ALLOW_DEV_ACTOR_HEADER não pode estar ligado em produção.');
  if (['memory', 'outbox'].includes(env.MAIL_PROVIDER ?? '')) errors.push('MAIL_PROVIDER de desenvolvimento (memory/outbox) não é permitido em produção; use smtp.');
  if ((env.MAIL_PROVIDER ?? '') === 'smtp' && !env.SMTP_HOST) errors.push('SMTP_HOST ausente.');
  if ((env.STORAGE_PROVIDER ?? 'local') === 'local' && !env.STORAGE_LOCAL_DIR) errors.push('STORAGE_LOCAL_DIR deve apontar para um diretório privado (ou configure outro STORAGE_PROVIDER).');
  if (!['staging', 'production'].includes(env.APP_ENV ?? '')) errors.push('APP_ENV deve ser staging ou production (ambientes separados; sem fallback).');
  if ((env.MAIL_PROVIDER ?? '') === 'smtp' && (!env.SMTP_USER || !env.SMTP_PASSWORD)) errors.push('SMTP_USER e SMTP_PASSWORD ausentes.');
  const sender = /<?([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>?\s*$/.exec(env.MAIL_FROM ?? '')?.[1] ?? '';
  if (!sender || /\.invalid$/i.test(sender)) errors.push('MAIL_FROM deve ser o remetente oficial (endereço real do domínio).');
  if (env.REQUIRE_MFA_FOR_ADMIN !== 'true') errors.push('REQUIRE_MFA_FOR_ADMIN deve ser true (MFA obrigatório para administradores).');
  const backupKey = env.BACKUP_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(backupKey) && Buffer.from(backupKey, 'base64').length !== 32) errors.push('BACKUP_ENCRYPTION_KEY deve ter 32 bytes (hex ou base64) e ser diferente da DATA_ENCRYPTION_KEY.');
  else if (backupKey === key) errors.push('BACKUP_ENCRYPTION_KEY deve ser diferente da DATA_ENCRYPTION_KEY.');
  return errors;
}
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  const errors = validateProductionConfig(env);
  if (errors.length) throw new Error(`Configuração de produção inválida:\n - ${errors.join('\n - ')}`);
}
