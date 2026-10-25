import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { CancelDto, CarriedOverDto, HoldDto, LifecycleService, ResumeDto, SustainmentDto, SustainmentPatchDto } from './lifecycle.service';

// O ProjectAccessGuard valida vínculo e empresa pelo :projectId; aqui valem os perfis de cada ação.
@Controller('projects/:projectId')
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER') @Get('status') status(@Param('projectId', ParseUUIDPipe) id: string) { return this.lifecycle.status(id); }
  @Roles('JGM4_ADMIN') @Post('status/hold') @HttpCode(200) hold(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: HoldDto) { return this.lifecycle.hold(id, dto); }
  @Roles('JGM4_ADMIN') @Post('status/cancel') @HttpCode(200) cancel(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: CancelDto) { return this.lifecycle.cancel(id, dto); }
  @Roles('JGM4_ADMIN') @Post('status/resume') @HttpCode(200) resume(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: ResumeDto) { return this.lifecycle.resume(id, dto); }

  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER') @Get('sustainment') sustainment(@Param('projectId', ParseUUIDPipe) id: string) { return this.lifecycle.sustainment(id); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Post('sustainment') addSustainment(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: SustainmentDto) { return this.lifecycle.addSustainment(id, dto); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Patch('sustainment/:itemId') updateSustainment(@Param('projectId', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: SustainmentPatchDto) { return this.lifecycle.updateSustainment(id, itemId, dto); }

  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER') @Get('carried-items') carried(@Param('projectId', ParseUUIDPipe) id: string) { return this.lifecycle.carried(id); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Post('carried-items') addCarried(@Param('projectId', ParseUUIDPipe) id: string, @Body() dto: CarriedOverDto) { return this.lifecycle.addCarried(id, dto); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Post('carried-items/:itemId/resolve') @HttpCode(200) resolveCarried(@Param('projectId', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) { return this.lifecycle.resolveCarried(id, itemId); }
}
