import { config } from 'dotenv';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupKey, encryptFile, parseDatabaseUrl, pgBin, run, sha256File } from './backup-lib.ts';

// Backup lógico do PostgreSQL (pg_dump, formato custom) cifrado com AES-256-GCM.
//   BACKUP_ENCRYPTION_KEY=<32 bytes hex/base64> npm run db:backup [-- --out pasta]
// O arquivo gerado é .dump.enc; guarde-o em local separado do banco e a chave em cofre de segredos.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env'), quiet: true });
const outIndex = process.argv.indexOf('--out'); const outDir = resolve(outIndex > 0 ? process.argv[outIndex + 1] : join(root, '.local', 'backups'));
const db = parseDatabaseUrl(process.env.DATABASE_URL ?? '');
const key = backupKey(); mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const plain = join(outDir, `jgm4-${db.database}-${stamp}.dump`); const encrypted = `${plain}.enc`;
try {
  run(pgBin('pg_dump'), ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '-n', db.schema, '-Fc', '--no-owner', '--no-privileges', '-f', plain], db.password);
  await encryptFile(plain, encrypted, key);
  console.log(JSON.stringify({ arquivo: encrypted, bytes: statSync(encrypted).size, sha256: await sha256File(encrypted), banco: db.database, esquema: db.schema, geradoEm: new Date().toISOString() }, null, 2));
} finally { rmSync(plain, { force: true }); }
