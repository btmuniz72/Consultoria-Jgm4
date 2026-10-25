import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/decorators';
import { ActivateTemplateDto, CreateTemplateDto, PatchTemplateDto, TemplatesService } from './templates.service';

class TemplatesQuery { @IsOptional() @IsString() @MaxLength(20) status?: string }

// Templates: somente JGM4_ADMIN altera; consultores JGM4 podem consultar os ATIVOS; clientes não têm acesso.
@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT') @Get('templates/active') active() { return this.templates.active(); }

  @Roles('JGM4_ADMIN') @Get('admin/templates') list(@Query() query: TemplatesQuery) { return this.templates.list(query.status); }
  @Roles('JGM4_ADMIN') @Post('admin/templates') create(@Body() dto: CreateTemplateDto) { return this.templates.create(dto); }
  @Roles('JGM4_ADMIN') @Get('admin/templates/:id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.templates.detail(id); }
  @Roles('JGM4_ADMIN') @Get('admin/templates/:id/preview') preview(@Param('id', ParseUUIDPipe) id: string) { return this.templates.preview(id); }
  @Roles('JGM4_ADMIN') @Patch('admin/templates/:id') patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchTemplateDto) { return this.templates.patch(id, dto); }
  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/validate') @HttpCode(200) validate(@Param('id', ParseUUIDPipe) id: string) { return this.templates.validate(id); }
  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/activate') @HttpCode(200) activate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateTemplateDto) { return this.templates.activate(id, dto); }
  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/inactivate') @HttpCode(200) inactivate(@Param('id', ParseUUIDPipe) id: string) { return this.templates.setStatus(id, 'INACTIVE'); }
  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/reactivate') @HttpCode(200) reactivate(@Param('id', ParseUUIDPipe) id: string) { return this.templates.setStatus(id, 'ACTIVE'); }
  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/archive') @HttpCode(200) archive(@Param('id', ParseUUIDPipe) id: string) { return this.templates.setStatus(id, 'ARCHIVED'); }
  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/new-version') newVersion(@Param('id', ParseUUIDPipe) id: string) { return this.templates.newVersion(id); }

  @Roles('JGM4_ADMIN') @Post('admin/templates/:id/items/:kind') addItem(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string, @Body() body: Record<string, unknown>) { return this.templates.addItem(id, kind, body); }
  @Roles('JGM4_ADMIN') @Patch('admin/templates/:id/items/:kind/:itemId') updateItem(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: Record<string, unknown>) { return this.templates.updateItem(id, kind, itemId, body); }
  @Roles('JGM4_ADMIN') @Delete('admin/templates/:id/items/:kind/:itemId') removeItem(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string, @Param('itemId', ParseUUIDPipe) itemId: string) { return this.templates.removeItem(id, kind, itemId); }
}
