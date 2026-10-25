import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AdminController, MembersController } from './admin/admin.controller';
import { AdminOpsController } from './admin/admin-ops.controller';
import { AdminOpsService } from './admin/admin-ops.service';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';
import { AdminService } from './admin/admin.service';
import { MembersService } from './admin/members.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { STORAGE, createStorage } from './attachments/storage';
import { MALWARE_SCANNER, createScanner } from './attachments/scanner';
import { SecurityEventsService } from './security/security-events.service';
import { RateLimitGuard, RateLimiter } from './security/rate-limiter';
import { MailService } from './security/mail.service';
import { SecureExceptionFilter } from './security/exception.filter';
import { AuthController } from './auth/auth.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { ReportsData } from './reports/reports-data';
import { LifecycleController } from './projects/lifecycle.controller';
import { LifecycleService } from './projects/lifecycle.service';
import { AuthService } from './auth/auth.service';
import { AccessService } from './auth/access.service';
import { AuthGuard, ProjectAccessGuard } from './auth/auth.guard';
import { Public } from './auth/decorators';
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
  @Public() @Get() async health() {
    try { await this.prisma.$queryRaw`SELECT 1`; }
    catch { throw new ServiceUnavailableException('Banco indisponível.'); }
    return { status: 'ok', database: 'connected', stage: 5 };
  }
  // Sondas mínimas, sem detalhes internos: liveness (processo vivo) e readiness (banco acessível).
  @Public() @Get('live') live() { return { status: 'ok' }; }
  @Public() @Get('ready') async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException({ status: 'unavailable' }); }
    return { status: 'ready' };
  }
}

@Module({
  controllers: [TemplatesController, AdminOpsController, ProjectsController, HealthController, RequestsController, TasksController, GatesController, ApprovalsController, AuthController, DashboardController, LifecycleController, ReportsController, AdminController, MembersController, AttachmentsController],
  providers: [TemplatesService, AdminOpsService, PrismaService, ProjectsService, RequestsService, TasksService, GatesService, ApprovalsService, AuthService, AccessService, DashboardService, LifecycleService, ReportsService, ReportsData, AdminService, MembersService, AttachmentsService,
    SecurityEventsService, RateLimiter, MailService, { provide: STORAGE, useFactory: createStorage }, { provide: MALWARE_SCANNER, useFactory: createScanner },
    { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: RateLimitGuard }, { provide: APP_GUARD, useClass: ProjectAccessGuard }, { provide: APP_FILTER, useClass: SecureExceptionFilter }],
})
export class AppModule {}
