import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { CommentDto, CommentsService } from './comments.service';

// Todas as rotas passam pelo ProjectAccessGuard (vínculo + empresa pelo :projectId). Leitura: qualquer membro; escrita: perfis que atuam.
@Controller('projects/:projectId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get() list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('taskId') taskId?: string, @Query('milestoneId') milestoneId?: string, @Query('requestId') requestId?: string) {
    return this.comments.list(projectId, { taskId, milestoneId, requestId });
  }

  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER', 'CLIENT_USER') @Post()
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CommentDto) { return this.comments.create(projectId, dto); }
}
