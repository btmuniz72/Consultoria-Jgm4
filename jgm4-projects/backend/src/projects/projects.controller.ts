import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { ProjectsService } from './projects.service';
import { TasksService } from '../tasks/tasks.service';
import { AccessService } from '../auth/access.service';
import { currentUser } from '../approvals/authority';

class ProjectsQuery {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService, private readonly tasksService: TasksService, private readonly access: AccessService) {}
  private scope() { return this.access.accessibleProjectIds(currentUser()!); }
  @Get('companies') async companies() { return this.projectsService.companies(await this.scope()); }
  @Get('projects') async projects(@Query() query: ProjectsQuery) { return this.projectsService.projects(query.companyId, await this.scope()); }
  @Get('projects/:id') project(@Param('id', new ParseUUIDPipe()) id: string) { return this.projectsService.project(id); }
  @Get('projects/:id/phases') phases(@Param('id', new ParseUUIDPipe()) id: string) { return this.projectsService.phases(id); }
  @Get('projects/:id/tasks') tasks(@Param('id', new ParseUUIDPipe()) id: string) { return this.tasksService.list(id); }
}
