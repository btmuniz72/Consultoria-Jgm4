import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { reviseOllem } from '../src/commercial/revise-ollem';
config({ path: resolve(__dirname, '../../.env'), quiet: true });
const prisma = new PrismaService();
async function main() {
  try { console.log(await reviseOllem(prisma, '9f1ead00-1c44-4000-8000-000000000002')); }
  finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('Falha na revisão; transação revertida. Verifique migrations e conexão.'); process.exitCode = 1; });
