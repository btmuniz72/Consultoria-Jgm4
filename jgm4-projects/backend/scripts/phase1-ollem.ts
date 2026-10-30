import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyPhase1 } from '../src/commercial/phase1-ollem';
config({ path: resolve(__dirname, '../../.env'), quiet: true });
const prisma = new PrismaService();
async function main() {
  try { console.log(JSON.stringify(await applyPhase1(prisma, '9f1ead00-1c44-4000-8000-000000000002'), null, 2)); }
  finally { await prisma.$disconnect(); }
}
void main().catch((error) => { console.error('Falha na carga da Fase 1; transação revertida.', error instanceof Error ? error.message : ''); process.exitCode = 1; });
