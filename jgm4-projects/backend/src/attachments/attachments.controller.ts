import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators';
import { RateLimit } from '../security/rate-limiter';
import { uploadConfig } from '../security/config';
import { AttachmentsService, UploadDto } from './attachments.service';

// Anexos privados: todas as rotas passam pelo ProjectAccessGuard (vínculo + empresa pelo :projectId). Upload: perfis que executam; leitura: membros do projeto.
@Controller('projects/:projectId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER') @RateLimit('upload', 30, 600) @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: uploadConfig().maxBytes, files: 1, fields: 5 }, defParamCharset: 'utf8' } as never))
  upload(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: UploadDto, @UploadedFile() file: { originalname: string; mimetype?: string; buffer: Buffer; size: number } | undefined) { return this.attachments.upload(projectId, dto, file); }

  @Get() list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string) { return this.attachments.list(projectId, entityType, entityId); }

  @RateLimit('download', 120, 600) @Get(':id/download')
  async download(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.attachments.download(projectId, id);
    res.set({ 'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Length': String(file.data.length) }).send(file.data);
  }
}
