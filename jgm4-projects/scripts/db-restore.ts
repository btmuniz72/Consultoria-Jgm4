import { config } from 'dotenv';
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { backupKey, decryptFile, parseDatabaseUrl, pgBin, run } from './backup-lib.ts';

// Restauração de um backup cifrado em um banco DE DESTINO (nunca no banco de origem, salvo --force-overwrite) e verificação por contagem de tabelas.
//   BACKUP_ENCRYPTION_KEY=... npm run db:restore -- --file <backup.dump.enc> --target <nome-do-banco-novo> [--keep]
// Cria o banco de destino, restaura, compara as contagens com o banco de origem (DATABASE_URL) e, sem --keep, remove o banco de teste.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env'), quiet: true });
const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const file = arg('--file'); const target = arg('--target'); const keep = process.argv.includes('--keep');
if (!file || !target) throw new Error('Uso: --file <backup.dump.enc> --target <banco-de-destino>');
if (!/^[a-z0-9_]{3,63}$/.test(target)) throw new Error('Nome de banco de destino inválido (use letras minúsculas, números e _).');
const source = parseDatabaseUrl(process.env.DATABASE_URL ?? '');
if (target === source.database && !process.argv.includes('--force-overwrite')) throw new Error('Recusado: o destino é o banco de origem. Restaure em um banco novo (ou use --force-overwrite conscientemente).');
const plain = `${file}.restore.dump`; const admin = { host: source.host, port: source.port, user: source.user };
const conn = (database: string) => ['-h', admin.host, '-p', admin.port, '-U', admin.user, '-d', database];
try {
  await decryptFile(file, plain, backupKey());
  run(pgBin('psql'), [...conn('postgres'), '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${target}"`], source.password);
  run(pgBin('createdb'), ['-h', admin.host, '-p', admin.port, '-U', admin.user, '--encoding=UTF8', target], source.password);
  run(pgBin('psql'), [...conn(target), '-v', 'ON_ERROR_STOP=1', '-c', `DROP SCHEMA IF EXISTS "${source.schema}" CASCADE`], source.password); // o dump recria o esquema
  run(pgBin('pg_restore'), [...conn(target), '--no-owner', '--no-privileges', '--exit-on-error', plain], source.password);
  const tables = ['User', 'Company', 'Project', 'Phase', 'Gate', 'Task', 'ProjectRequest', 'TimeEntry', 'Approval', 'AuditLog', 'ProjectMembership', 'ReportGenerationLog', 'SecurityEvent', 'Attachment'];
  const counts = async (database: string) => {
    const pool = new Pool({ host: admin.host, port: Number(admin.port), user: admin.user, password: source.password, database }); const out: Record<string, number> = {};
    try { await pool.query(`SET search_path TO "${source.schema}"`); for (const table of tables) out[table] = Number((await pool.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n); } finally { await pool.end(); }
    return out;
  };
  const [before, after] = [await counts(source.database), await counts(target)];
  const diff = tables.filter((table) => before[table] !== after[table]);
  console.log(JSON.stringify({ restauradoEm: target, tabelas: tables.map((table) => ({ tabela: table, origem: before[table], restaurado: after[table], ok: before[table] === after[table] })), resultado: diff.length ? `DIVERGÊNCIA em ${diff.join(', ')}` : 'OK: contagens idênticas' }, null, 2));
  if (diff.length) process.exitCode = 2;
} finally {
  rmSync(plain, { force: true });
  if (!keep) run(pgBin('psql'), [...conn('postgres'), '-c', `DROP DATABASE IF EXISTS "${target}"`], source.password);
}
