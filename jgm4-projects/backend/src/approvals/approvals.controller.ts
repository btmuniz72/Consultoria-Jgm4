import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalsQuery, DecisionDto, DueDateChangeDto, ReasonDto, ResponsibleChangeDto, SummaryQuery } from './approvals.dto';

@Controller()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}
  @Get('approvals') list(@Query() query: ApprovalsQuery) { return this.approvals.list(query); }
  @Get('approvals/summary') summary(@Query() query: SummaryQuery) { return this.approvals.summary(query.projectId); }
  @Get('approvals/authority') authority() { return this.approvals.authority(); }
  @Get('approvals/:id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.approvals.detail(id); }
  @Post('approvals/:id/approve') @HttpCode(200) approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.approvals.decide(id, 'approve', dto); }
  @Post('approvals/:id/request-adjustment') @HttpCode(200) adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.approvals.decide(id, 'adjust', dto); }
  @Post('approvals/:id/reject') @HttpCode(200) reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.approvals.decide(id, 'reject', dto); }
  @Get('projects/:projectId/approvals/pending') pending(@Param('projectId', ParseUUIDPipe) projectId: string) { return this.approvals.projectPending(projectId); }
  @Post('tasks/:taskId/due-date-change') dueDate(@Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: DueDateChangeDto) { return this.approvals.requestDueDateChange(taskId, dto); }
  @Post('tasks/:taskId/responsible-change') responsible(@Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: ResponsibleChangeDto) { return this.approvals.requestResponsibleChange(taskId, dto); }
  @Post('tasks/:taskId/reopen') reopen(@Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: ReasonDto) { return this.approvals.requestReopen(taskId, dto); }
  @Post('projects/:projectId/requests/:requestId/cancellation') cancel(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: ReasonDto) { return this.approvals.requestCancellation(projectId, requestId, dto); }
}
