import { INestApplication, ValidationPipe } from '@nestjs/common';
import { actorMiddleware } from './approvals/authority';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(actorMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: [process.env.FRONTEND_ORIGIN || 'http://localhost:4200', 'http://127.0.0.1:4200'], methods: ['GET', 'POST', 'PATCH', 'HEAD', 'OPTIONS'] });
  app.enableShutdownHooks();
}
