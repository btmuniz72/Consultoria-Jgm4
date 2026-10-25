import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = join(root, '.local');
const data = join(local, 'postgres');
const envPath = join(root, '.env');
const action = process.argv[2];
if (!['start', 'stop'].includes(action)) throw new Error('Use start ou stop.');
config({ path: envPath, quiet: true });
const candidates = [process.env.PG_BIN, 'D:/Program Files/PostgreSQL/18/bin', 'C:/Program Files/PostgreSQL/18/bin'];
const suffix = process.platform === 'win32' ? '.exe' : '';
const bin = candidates.find((item) => item && existsSync(join(item, `pg_ctl${suffix}`)));
if (!bin) throw new Error('Informe PG_BIN (pasta bin do PostgreSQL 18) no ambiente ou no .env.');
function run(command: string, args: string[], extraEnv: Record<string, string> = {}) {
  const result = spawnSync(join(bin!, command + suffix), args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    timeout: 60000,
    // O servidor iniciado por pg_ctl não deve herdar pipes do processo Node.
    stdio: command === 'pg_ctl' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout || result.error?.message}`);
  return result.stdout;
}
if (action === 'stop') {
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  console.log('PostgreSQL exclusivo do JGM4 Projects parado.');
} else {
  mkdirSync(local, { recursive: true });
  // Nunca usa ou altera a instalação/cluster já existente na porta 5432.
  if (!existsSync(envPath)) {
    if (existsSync(join(data, 'PG_VERSION'))) throw new Error('Cluster existente sem .env: restaure o arquivo local para preservar as credenciais.');
    const password = randomBytes(32).toString('hex');
    writeFileSync(envPath, `DATABASE_URL="postgresql://jgm4_local:${password}@127.0.0.1:5433/jgm4_projects?schema=public"\nPORT=3000\nFRONTEND_ORIGIN=http://localhost:4200\nJWT_SECRET=${randomBytes(48).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
    config({ path: envPath, override: true, quiet: true });
  }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.hostname !== '127.0.0.1' || url.port !== '5433' || url.pathname !== '/jgm4_projects') {
    throw new Error('db:start gerencia somente 127.0.0.1:5433/jgm4_projects. Para outro banco, inicie-o separadamente e use db:migrate/db:seed.');
  }
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!existsSync(join(data, 'PG_VERSION'))) {
    const pwfile = join(local, 'init-password');
    try {
      writeFileSync(pwfile, password, { mode: 0o600 });
      run('initdb', ['-D', data, '-U', username, '--pwfile', pwfile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C']);
    } finally { rmSync(pwfile, { force: true }); }
  }
  const ready = spawnSync(join(bin!, `pg_ctl${suffix}`), ['-D', data, 'status'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
  if (!existsSync(join(data, 'postmaster.pid')) || ready.status !== 0) {
    run('pg_ctl', ['-D', data, '-l', join(local, 'postgres.log'), '-o', '-h 127.0.0.1 -p 5433', '-w', 'start']);
  }
  const pgEnv = { PGPASSWORD: password };
  const connection = ['-w', '-h', '127.0.0.1', '-p', '5433', '-U', username];
  const found = run('psql', [...connection, '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='jgm4_projects'"], pgEnv).trim();
  if (found !== '1') run('createdb', [...connection, '--encoding=UTF8', 'jgm4_projects'], pgEnv);
  console.log('PostgreSQL local pronto em 127.0.0.1:5433; credenciais somente em .env ignorado pelo Git.');
}
