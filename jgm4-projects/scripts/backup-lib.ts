import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, existsSync, fstatSync, openSync, readSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

// Backup criptografado (AES-256-GCM, padrão do Node): [magic 'JGM4BK1\0'][iv 12 bytes][conteúdo cifrado][tag 16 bytes].
// A chave (BACKUP_ENCRYPTION_KEY, 32 bytes em hex ou base64) NUNCA fica junto do arquivo nem do repositório.
const MAGIC = Buffer.from('JGM4BK1\0');
export function backupKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY ?? '';
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hexadecimais ou base64).');
  return key;
}
export async function encryptFile(source: string, target: string, key: Buffer) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const out = createWriteStream(target, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv]));
  await pipeline(createReadStream(source), cipher, out, { end: false } as never).catch(() => undefined);
  await new Promise<void>((resolve, reject) => out.write(cipher.getAuthTag(), (error) => (error ? reject(error) : out.end(resolve))));
}
export async function decryptFile(source: string, target: string, key: Buffer) {
  const fd = openSync(source, 'r'); const size = fstatSync(fd).size; const head = Buffer.alloc(MAGIC.length + 12); const tag = Buffer.alloc(16);
  readSync(fd, head, 0, head.length, 0); readSync(fd, tag, 0, 16, size - 16); closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Arquivo de backup inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key, head.subarray(MAGIC.length)); decipher.setAuthTag(tag);
  await pipeline(createReadStream(source, { start: head.length, end: size - 17 }), decipher, createWriteStream(target, { mode: 0o600 }));
}
export const sha256File = (path: string) => new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject); });

export function pgBin(name: string) {
  const candidates = [process.env.PG_BIN, 'D:/Program Files/PostgreSQL/18/bin', 'C:/Program Files/PostgreSQL/18/bin', '/usr/bin', '/usr/lib/postgresql/18/bin'];
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const dir = candidates.find((item) => item && existsSync(join(item, name + suffix)));
  if (!dir) throw new Error(`${name} não encontrado: defina PG_BIN com a pasta bin do PostgreSQL.`);
  return join(dir, name + suffix);
}
export function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: parsed.port || '5432', user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.slice(1), schema: parsed.searchParams.get('schema') || 'public' };
}
export function run(command: string, args: string[], password: string) {
  const result = spawnSync(command, args, { env: { ...process.env, PGPASSWORD: password }, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${command.split(/[\\/]/).pop()} falhou: ${(result.stderr || result.stdout || result.error?.message || '').toString().replace(password, '***').slice(0, 400)}`);
  return result.stdout;
}
export { rmSync, writeSync };
