import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { DashboardService } from './dashboard.service';

@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  // Visão multi-projeto: somente JGM4 (o escopo de projetos é filtrado por vínculo no serviço).
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Get('dashboard') overview() { return this.dashboard.overview(); }
  // Acesso ao projeto validado pelo ProjectAccessGuard (vínculo + empresa).
  @Get('projects/:id/dashboard') project(@Param('id', ParseUUIDPipe) id: string) { return this.dashboard.project(id); }
}
