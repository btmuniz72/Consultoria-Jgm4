import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequirementDto, RequestsQuery, TransitionDto } from './requests.dto';

@Controller('projects/:projectId/requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}
  @Get() list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: RequestsQuery) { return this.requests.list(projectId, query.filter); }
  @Get(':id') detail(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) { return this.requests.detail(projectId, id); }
  @Post(':id/request') @HttpCode(200) request(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) { return this.requests.transition(projectId, id, 'request', dto); }
  @Post(':id/start') @HttpCode(200) start(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) { return this.requests.transition(projectId, id, 'start', dto); }
  @Post(':id/send') @HttpCode(200) send(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) { return this.requests.transition(projectId, id, 'send', dto); }
  @Post(':id/start-review') @HttpCode(200) review(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) { return this.requests.transition(projectId, id, 'start-review', dto); }
  @Post(':id/request-adjustment') @HttpCode(200) adjustment(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) { return this.requests.transition(projectId, id, 'request-adjustment', dto); }
  @Post(':id/accept') @HttpCode(200) accept(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) { return this.requests.transition(projectId, id, 'accept', dto); }
  @Patch(':id/requirements/:requirementId') requirement(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Param('requirementId', ParseUUIDPipe) requirementId: string, @Body() dto: RequirementDto) { return this.requests.requirement(projectId, id, requirementId, dto); }
}
