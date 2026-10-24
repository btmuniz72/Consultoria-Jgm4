import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { ProjectsService } from './projects.service';
import { TasksService } from '../tasks/tasks.service';

class ProjectsQuery {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService, private readonly tasksService: TasksService) {}
  @Get('companies') companies() { return this.projectsService.companies(); }
  @Get('projects') projects(@Query() query: ProjectsQuery) { return this.projectsService.projects(query.companyId); }
  @Get('projects/:id') project(@Param('id', new ParseUUIDPipe()) id: string) { return this.projectsService.project(id); }
  @Get('projects/:id/phases') phases(@Param('id', new ParseUUIDPipe()) id: string) { return this.projectsService.phases(id); }
  @Get('projects/:id/tasks') tasks(@Param('id', new ParseUUIDPipe()) id: string) { return this.tasksService.list(id); }
}
