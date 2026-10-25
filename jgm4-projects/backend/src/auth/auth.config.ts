import { randomBytes } from 'node:crypto';
import { sessionConfig } from '../security/config';

// Cookies: sessão (access token curto, HttpOnly), refresh (HttpOnly, só no caminho /api/auth) e CSRF (legível pelo front, não é credencial).
export const COOKIE_NAME = 'jgm4_session';
export const REFRESH_COOKIE = 'jgm4_refresh';
export const CSRF_COOKIE = 'jgm4_csrf';
export const CSRF_HEADER = 'x-csrf-token';
let ephemeral: string | undefined;

export const isProduction = () => process.env.NODE_ENV === 'production';
/** Modo de desenvolvimento: aceita x-actor-role / JGM4_LOCAL_ACTOR. Nunca em produção. */
export const devActorEnabled = () => process.env.ALLOW_DEV_ACTOR_HEADER === 'true' && !isProduction();
export const bcryptCost = () => Math.min(14, Math.max(4, Number(process.env.BCRYPT_COST) || 12));
export const accessTtl = () => `${sessionConfig().accessMinutes}m`;

export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (secret.length < 32) throw new Error('JWT_SECRET deve ter ao menos 32 caracteres.');
    return secret;
  }
  if (isProduction()) throw new Error('JWT_SECRET é obrigatório em produção.');
  // Desenvolvimento sem segredo configurado: segredo efêmero (as sessões caem a cada reinício da API).
  if (!ephemeral) { ephemeral = randomBytes(48).toString('hex'); console.warn('[auth] JWT_SECRET ausente: usando segredo efêmero de desenvolvimento.'); }
  return ephemeral;
}
