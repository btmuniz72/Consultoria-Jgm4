import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { GatesController } from './gates/gates.controller';
import { GatesService } from './gates/gates.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { ApprovalsService } from './approvals/approvals.service';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async health() {
    try { await this.prisma.$queryRaw`SELECT 1`; }
    catch { throw new ServiceUnavailableException('Banco indisponível.'); }
    return { status: 'ok', database: 'connected', stage: 5 };
  }
}

@Module({
  controllers: [ProjectsController, HealthController, RequestsController, TasksController, GatesController, ApprovalsController],
  providers: [PrismaService, ProjectsService, RequestsService, TasksService, GatesService, ApprovalsService],
})
export class AppModule {}
