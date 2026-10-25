import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/decorators';
import { ActivateDto, AdminMemberDto, ApplyTemplateDto, AdminMemberPatchDto, AdminOpsService, CompanyDto, CompanyPatchDto, CompanyStatusDto, ProjectCreateDto, ProjectPatchDto, UserPatchDto } from './admin-ops.service';

class CompaniesQuery { @IsOptional() @IsString() @MaxLength(80) q?: string; @IsOptional() @IsString() @MaxLength(20) status?: string }
class ProjectsQuery {
  @IsOptional() @IsString() @MaxLength(80) q?: string; @IsOptional() @IsString() @MaxLength(40) companyId?: string; @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsString() @MaxLength(40) consultantId?: string; @IsOptional() @IsString() @MaxLength(3) phase?: string;
}

// Administração operacional (Etapa 10A). Todo o grupo exige JGM4_ADMIN no backend; o frontend apenas esconde os atalhos.
@Controller('admin')
@Roles('JGM4_ADMIN')
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get('companies') companies(@Query() query: CompaniesQuery) { return this.ops.companies(query); }
  @Post('companies') createCompany(@Body() dto: CompanyDto) { return this.ops.createCompany(dto); }
  @Patch('companies/:id') updateCompany(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyPatchDto) { return this.ops.updateCompany(id, dto); }
  @Patch('companies/:id/status') companyStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyStatusDto) { return this.ops.setCompanyStatus(id, dto); }

  @Patch('users/:id') patchUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserPatchDto) { return this.ops.patchUser(id, dto); }
  @Post('users/:id/reset-access') @HttpCode(200) resetAccess(@Param('id', ParseUUIDPipe) id: string) { return this.ops.resetAccess(id); }

  @Get('projects') projects(@Query() query: ProjectsQuery) { return this.ops.projects(query); }
  @Post('projects') createProject(@Body() dto: ProjectCreateDto) { return this.ops.createProject(dto); }
  @Patch('projects/:id') updateProject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProjectPatchDto) { return this.ops.updateProject(id, dto); }
  @Post('projects/:id/activate') @HttpCode(200) activate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateDto) { return this.ops.activate(id, dto); }
  @Post('projects/:id/apply-template') @HttpCode(200) applyTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyTemplateDto) { return this.ops.applyTemplate(id, dto.templateId); }
  /** @deprecated use apply-template (mantido pela compatibilidade com a Etapa 10A). */
  @Post('projects/:id/clone-plan-c') @HttpCode(200) clonePlanC(@Param('id', ParseUUIDPipe) id: string) { return this.ops.clonePlanC(id); }

  @Get('projects/:id/members') members(@Param('id', ParseUUIDPipe) id: string) { return this.ops.members(id); }
  @Post('projects/:id/members') addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminMemberDto) { return this.ops.addMember(id, dto); }
  @Patch('projects/:id/members/:membershipId') patchMember(@Param('id', ParseUUIDPipe) id: string, @Param('membershipId', ParseUUIDPipe) membershipId: string, @Body() dto: AdminMemberPatchDto) { return this.ops.patchMember(id, membershipId, dto); }
}
