import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { TaskEvidenceDto, TaskPlanDto, TaskRequirementDto, TaskTransitionDto, TimeEntryDto } from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get('projects/:projectId/tasks/:taskId') detail(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.tasks.detail(projectId, taskId); }
  @Get('tasks/:taskId') detailById(@Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.tasks.detailById(taskId); }
  @Post('tasks/:taskId/start') start(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'start', dto); }
  @Post('tasks/:taskId/send-validation') send(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'send-validation', dto); }
  @Post('tasks/:taskId/submit-evidence') submitEvidence(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'submit-evidence', dto); }
  @Post('tasks/:taskId/validate') validate(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'validate', dto); }
  @Post('tasks/:taskId/request-adjustment') adjust(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'request-adjustment', dto); }
  @Post('tasks/:taskId/resume') resume(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'resume', dto); }
  @Post('tasks/:taskId/complete') complete(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskTransitionDto) { return this.tasks.transitionById(taskId, 'complete', dto); }
  @Patch('tasks/:taskId/requirements/:requirementId') requirement(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Param('requirementId', new ParseUUIDPipe()) requirementId: string, @Body() dto: TaskRequirementDto) { return this.tasks.requirementById(taskId, requirementId, dto); }
  @Post('tasks/:taskId/evidence') evidence(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskEvidenceDto) { return this.tasks.addEvidenceById(taskId, dto); }
  @Post('tasks/:taskId/time-entries') timeEntry(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TimeEntryDto) { return this.tasks.addTimeEntryById(taskId, dto); }
  @Patch('tasks/:taskId/plan') plan(@Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() dto: TaskPlanDto) { return this.tasks.updatePlanById(taskId, dto); }
  @Get('projects/:projectId/activity-summary/phases') phaseSummary(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.tasks.phaseSummary(projectId); }
  @Get('projects/:projectId/activity-summary') projectSummary(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.tasks.projectSummary(projectId); }
}
