import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '127.0.0.1');
  console.log(`JGM4 Projects API local: http://localhost:${port}/api`);
}
bootstrap().catch(() => { console.error('Não foi possível iniciar a API. Verifique o banco e o .env local.'); process.exitCode = 1; });
