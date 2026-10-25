import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { jwtSecret } from '../auth/auth.config';

// Somente primitivas padrão do Node (AES-256-GCM, HMAC-SHA256, SHA-256). Sem criptografia caseira.
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Chave de dados (MFA etc.): DATA_ENCRYPTION_KEY (32 bytes); em desenvolvimento, derivada do segredo do JWT via HKDF. */
function dataKey(): Buffer {
  const configured = process.env.DATA_ENCRYPTION_KEY;
  if (configured) {
    const key = /^[0-9a-fA-F]{64}$/.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY deve ter 32 bytes.');
    return key;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY é obrigatória em produção.');
  return Buffer.from(hkdfSync('sha256', jwtSecret(), 'jgm4-data-key', 'dev-only', 32));
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}
export function decryptSecret(payload: string): string {
  const [version, iv, tag, body] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Segredo cifrado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/** Token anti-CSRF: HMAC da sessão com o segredo da aplicação (não adivinhável; o atacante cross-site não o lê). */
export const csrfTokenFor = (sessionId: string) => createHmac('sha256', Buffer.from(hkdfSync('sha256', jwtSecret(), 'jgm4-csrf', 'v1', 32))).update(sessionId).digest('base64url');
