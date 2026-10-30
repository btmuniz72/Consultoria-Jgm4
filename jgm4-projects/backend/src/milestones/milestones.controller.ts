import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { ClientDecisionDto, CriterionDto, MilestonePlanDto, MilestonesService, OpinionDto, ReasonDto } from './milestones.service';

// Marcos internos da fase. Leitura: qualquer membro do projeto (inclui diretoria). Escrita: alçada conferida no serviço
// (JGM4 gere; patrocinador/gestor da Ollem decidem). Todas as rotas passam pelo ProjectAccessGuard pelo :projectId.
@Controller('projects/:projectId/milestones')
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}
  @Get() list(@Param('projectId', ParseUUIDPipe) projectId: string) { return this.milestones.list(projectId); }
  @Get(':id') detail(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) { return this.milestones.detail(projectId, id); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Patch(':id/plan') plan(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MilestonePlanDto) { return this.milestones.updatePlan(projectId, id, dto); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Patch(':id/criteria/:criterionId') criterion(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Param('criterionId', ParseUUIDPipe) criterionId: string, @Body() dto: CriterionDto) { return this.milestones.setCriterion(projectId, id, criterionId, dto); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Post(':id/start-review') @HttpCode(200) start(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) { return this.milestones.startReview(projectId, id); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Post(':id/request-correction') @HttpCode(200) correction(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.milestones.requestCorrection(projectId, id, dto); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Post(':id/technical-opinion') @HttpCode(200) opinion(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OpinionDto) { return this.milestones.technicalOpinion(projectId, id, dto); }
  @Roles('CLIENT_SPONSOR', 'CLIENT_MANAGER') @Post(':id/client-decision') @HttpCode(200) decision(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClientDecisionDto) { return this.milestones.clientDecision(projectId, id, dto); }
}
