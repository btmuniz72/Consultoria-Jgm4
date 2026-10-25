import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { CommercialService } from './commercial.service';
import { CommercialPhaseDto, ContractDto, DependencyDto, NoteDto, ProposalAcceptDto, ProposalDraftDto, ScheduleDto } from './commercial.dto';
@Controller('projects/:projectId')
export class CommercialController {
  constructor(private readonly commercial: CommercialService) {}
  @Get('proposal') view(@Param('projectId', ParseUUIDPipe) id: string) { return this.commercial.view(id); }
  @Roles('JGM4_ADMIN') @Patch('commercial/phases/:phaseId') phase(@Param('projectId', ParseUUIDPipe) id: string, @Param('phaseId', ParseUUIDPipe) phase: string, @Body() dto: CommercialPhaseDto) { return this.commercial.configurePhase(id, phase, dto); }
  @Roles('JGM4_ADMIN') @Patch('commercial/phases/:phaseId/schedule') schedule(@Param('projectId', ParseUUIDPipe) id: string, @Param('phaseId', ParseUUIDPipe) phase: string, @Body() dto: ScheduleDto) { return this.commercial.schedule(id, phase, dto); }
  @Roles('JGM4_ADMIN') @Post('proposals') draft(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: ProposalDraftDto) { return this.commercial.draft(id, dto); }
  @Roles('JGM4_ADMIN') @Post('proposals/:proposalId/send') send(@Param('projectId', ParseUUIDPipe) id: string, @Param('proposalId', ParseUUIDPipe) p: string) { return this.commercial.transition(id, p, 'send'); }
  @Roles('CLIENT_SPONSOR', 'CLIENT_MANAGER') @Post('proposals/:proposalId/review') review(@Param('projectId', ParseUUIDPipe) id: string, @Param('proposalId', ParseUUIDPipe) p: string) { return this.commercial.transition(id, p, 'review'); }
  @Roles('CLIENT_SPONSOR') @Post('proposals/:proposalId/accept') accept(@Param('projectId', ParseUUIDPipe) id: string, @Param('proposalId', ParseUUIDPipe) p: string, @Body() dto: ProposalAcceptDto) { return this.commercial.transition(id, p, 'accept', dto); }
  @Roles('CLIENT_SPONSOR') @Post('proposals/:proposalId/reject') reject(@Param('projectId', ParseUUIDPipe) id: string, @Param('proposalId', ParseUUIDPipe) p: string, @Body() dto: NoteDto) { return this.commercial.transition(id, p, 'reject', dto); }
  @Post('proposals/:proposalId/comments') comment(@Param('projectId', ParseUUIDPipe) id: string, @Param('proposalId', ParseUUIDPipe) p: string, @Body() dto: NoteDto) { return this.commercial.comment(id, p, dto.text); }
  @Roles('JGM4_ADMIN') @Patch('commercial/contract') contract(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: ContractDto) { return this.commercial.contract(id, dto); }
  @Roles('JGM4_ADMIN') @Post('commercial/start') start(@Param('projectId', ParseUUIDPipe) id: string) { return this.commercial.start(id); }
  @Roles('JGM4_ADMIN') @Post('commercial/start-exception') exception(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: NoteDto) { return this.commercial.start(id, dto.text); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_MANAGER', 'CLIENT_SPONSOR') @Post('external-dependencies') dependency(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: DependencyDto) { return this.commercial.dependency(id, dto); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_MANAGER', 'CLIENT_SPONSOR') @Patch('external-dependencies/:dependencyId') update(@Param('projectId', ParseUUIDPipe) id: string, @Param('dependencyId', ParseUUIDPipe) d: string, @Body() dto: DependencyDto) { return this.commercial.dependency(id, dto, d); }
  @Roles('CLIENT_SPONSOR', 'CLIENT_MANAGER') @Post('tasks/:taskId/movement-acceptance') movement(@Param('projectId', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) t: string, @Body() dto: NoteDto) { return this.commercial.approveMovement(id, t, dto.text); }
}
