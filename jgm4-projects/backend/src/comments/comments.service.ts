import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { assertCan, currentRole, currentUserId, isJgm4Role } from '../approvals/authority';
import { isUuid } from '../auth/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectOpen } from '../projects/project-guard';

export class CommentDto {
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() milestoneId?: string;
  @IsOptional() @IsUUID() requestId?: string;
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  @IsOptional() @IsBoolean() internal?: boolean;
}

type Target = { taskId?: string; milestoneId?: string; requestId?: string };

/**
 * Comentários append-only de atividade, marco ou solicitação.
 * Isolamento: o :projectId da rota já foi validado (vínculo + empresa) pelo ProjectAccessGuard; aqui a entidade
 * precisa pertencer a ESSE projeto (e o banco repete a regra por chave estrangeira composta).
 * Nota interna JGM4: só JGM4 escreve e só JGM4 lê — o filtro está neste único método de leitura.
 */
@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  private target(input: Target) {
    const keys = (['taskId', 'milestoneId', 'requestId'] as const).filter((key) => input[key]);
    if (keys.length !== 1) throw new BadRequestException('Informe exatamente uma entidade: taskId, milestoneId ou requestId.');
    if (!isUuid(input[keys[0]])) throw new BadRequestException('Identificador inválido.');
    return { key: keys[0], id: input[keys[0]]! };
  }

  private async assertEntity(projectId: string, target: { key: 'taskId' | 'milestoneId' | 'requestId'; id: string }) {
    const where = { id: target.id, projectId }; const select = { id: true } as const;
    const found = target.key === 'taskId' ? await this.prisma.task.findFirst({ where, select })
      : target.key === 'milestoneId' ? await this.prisma.phaseMilestone.findFirst({ where, select })
      : await this.prisma.projectRequest.findFirst({ where, select });
    if (!found) throw new NotFoundException('Item não encontrado neste projeto.');
  }

  async list(projectId: string, query: Target) {
    const target = this.target(query);
    await this.assertEntity(projectId, target);
    const rows = await this.prisma.comment.findMany({
      where: { projectId, [target.key]: target.id, ...(isJgm4Role(currentRole()) ? {} : { internal: false }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 500, include: { author: { select: { name: true } } },
    });
    return rows.map((row) => ({ id: row.id, body: row.body, internal: row.internal, authorName: row.author.name, authorRole: row.authorRole, createdAt: row.createdAt }));
  }

  async create(projectId: string, dto: CommentDto) {
    assertCan(currentRole(), 'COMMENT_WRITE', 'O perfil não pode comentar.');
    if (dto.internal) assertCan(currentRole(), 'INTERNAL_NOTE_WRITE', 'Somente a JGM4 registra notas internas.');
    const userId = currentUserId(); if (!userId) throw new ForbiddenException('Usuário autenticado necessário.');
    const target = this.target(dto);
    const body = dto.body.trim(); if (!body) throw new BadRequestException('Escreva o comentário.');
    return this.prisma.$transaction(async (tx) => {
      await assertProjectOpen(tx, projectId);
      await this.assertEntity(projectId, target);
      const row = await tx.comment.create({ data: { projectId, [target.key]: target.id, authorUserId: userId, authorRole: currentRole(), body, internal: dto.internal === true }, include: { author: { select: { name: true } } } });
      // O texto do comentário não vai para a auditoria (o histórico de atividade é visível ao cliente; nota interna não pode vazar).
      await tx.auditLog.create({ data: { userId, projectId, entityType: 'Comment', entityId: row.id, action: row.internal ? 'INTERNAL_NOTE_CREATED' : 'COMMENT_CREATED', actorType: currentRole(), newValue: { [target.key]: target.id } } });
      return { id: row.id, body: row.body, internal: row.internal, authorName: row.author.name, authorRole: row.authorRole, createdAt: row.createdAt };
    });
  }
}
