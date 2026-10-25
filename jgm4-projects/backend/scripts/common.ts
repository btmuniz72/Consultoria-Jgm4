import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Cliente Prisma para rotinas administrativas (retenção, bootstrap). Mesma configuração de TLS da aplicação.
config({ path: resolve(__dirname, '../../.env'), quiet: true });
export function createClient() {
  const connectionString = process.env.DATABASE_URL; if (!connectionString) throw new Error('DATABASE_URL não configurada.');
  const ssl = process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false', ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}) } : undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(ssl ? { ssl } : {}) }, { schema: new URL(connectionString).searchParams.get('schema') || 'public' }) });
}
