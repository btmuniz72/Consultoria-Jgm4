import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { GatesService } from './gates.service';

@Controller()
export class GatesController {
  constructor(private readonly gates: GatesService) {}
  @Get('projects/:projectId/gates') list(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.gates.list(projectId); }
  @Get('projects/:projectId/gates/:gateId') detail(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('gateId', new ParseUUIDPipe()) gateId: string) { return this.gates.detail(projectId, gateId); }
  @Post('gates/:gateId/start-review') start(@Param('gateId', new ParseUUIDPipe()) id: string, @Body() body: Record<string, any>) { return this.gates.transitionForGate(id, 'start-review', body); }
  @Post('gates/:gateId/request-correction') correction(@Param('gateId', new ParseUUIDPipe()) id: string, @Body() body: Record<string, any>) { return this.gates.transitionForGate(id, 'request-correction', body); }
  @Post('gates/:gateId/resume-review') resume(@Param('gateId', new ParseUUIDPipe()) id: string, @Body() body: Record<string, any>) { return this.gates.transitionForGate(id, 'resume-review', body); }
  @Post('gates/:gateId/technical-opinion') opinion(@Param('gateId', new ParseUUIDPipe()) id: string, @Body() body: Record<string, any>) { return this.gates.transitionForGate(id, 'technical-opinion', body); }
  @Post('gates/:gateId/client-decision') decision(@Param('gateId', new ParseUUIDPipe()) id: string, @Body() body: Record<string, any>) { return this.gates.transitionForGate(id, 'client-decision', body); }
  @Post('gates/:gateId/criteria') criterion(@Param('gateId', new ParseUUIDPipe()) id: string, @Body() body: Record<string, any>) { return this.gates.transitionForGate(id, 'criterion', body); }
}
