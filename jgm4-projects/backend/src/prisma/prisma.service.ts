import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL não configurada. Execute npm run setup.');
    const schema = new URL(connectionString).searchParams.get('schema') || 'public';
    // TLS com o banco (produção): DATABASE_SSL=require valida o certificado; DATABASE_SSL_CA aceita uma autoridade própria.
    const ssl = process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false', ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}) } : undefined;
    super({ adapter: new PrismaPg({ connectionString, ...(ssl ? { ssl } : {}) }, { schema }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
