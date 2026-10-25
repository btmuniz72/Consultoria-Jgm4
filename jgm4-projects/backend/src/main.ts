import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { serveFrontend } from './security/http-security';
import { JsonLogger } from './security/json-logger';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
async function bootstrap() {
  const app = await NestFactory.create(AppModule, process.env.NODE_ENV === 'production' ? { logger: new JsonLogger() } : {});
  configureApp(app);
  const served = serveFrontend(app); // opcional: FRONTEND_DIST_DIR (app e API no mesmo domínio)
  const port = Number(process.env.PORT || 3000);
  // Local: só loopback. Em produção a API fica atrás de um proxy HTTPS e escuta no endereço definido por HOST.
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
  console.log(`JGM4 Projects API (${process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'}) na porta ${port}${served ? ' com frontend' : ''}.`);
}
bootstrap().catch((error: Error) => {
  // Mostra apenas a causa de configuração (sem segredos) para facilitar a operação.
  console.error(error?.message?.startsWith('Configuração de produção') ? error.message : 'Não foi possível iniciar a API. Verifique o banco e o .env local.');
  process.exitCode = 1;
});
