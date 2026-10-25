import { createHmac, randomBytes } from 'node:crypto';

// TOTP (RFC 6238, HMAC-SHA1, 6 dígitos, passo de 30 s) — compatível com Google Authenticator, Microsoft Authenticator, 1Password etc.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buffer: Buffer) {
  let bits = ''; for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) ?? []).map((chunk) => ALPHABET[parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}
export function base32Decode(text: string) {
  let bits = ''; for (const char of text.replace(/=+$/, '').toUpperCase()) { const index = ALPHABET.indexOf(char); if (index < 0) throw new Error('Base32 inválido.'); bits += index.toString(2).padStart(5, '0'); }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
}
export const generateTotpSecret = () => base32Encode(randomBytes(20));
export function totpAt(secret: string, timeMs: number, stepSeconds = 30) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / stepSeconds)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest(); const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
/** Aceita o passo atual e ±1 (tolerância de relógio). */
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((drift) => totpAt(secret, now + drift * 30000) === code);
}
export const otpauthUri = (email: string, secret: string, issuer = 'JGM4 Projects') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
