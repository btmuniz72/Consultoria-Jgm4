import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { IsIn, IsUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { currentRole, currentUserId } from '../approvals/authority';
import { assertProjectOpen } from '../projects/project-guard';
import { sha256 } from '../security/crypto';
import { uploadConfig } from '../security/config';
import { SecurityEventsService } from '../security/security-events.service';
import { inspectFile, safeFileName } from './file-validation';
import { MALWARE_SCANNER, MalwareScanner, scanRequired } from './scanner';
import { STORAGE, StorageProvider } from './storage';

export class UploadDto { @IsIn(['Task', 'ProjectRequest']) entityType!: 'Task' | 'ProjectRequest'; @IsUUID() entityId!: string }

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService, @Inject(STORAGE) private readonly storage: StorageProvider, @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner, private readonly events: SecurityEventsService) {}

  private downloadable(row: { scanStatus: string }) { return row.scanStatus === 'CLEAN' || (row.scanStatus === 'SKIPPED' && !scanRequired()); }
  private present(row: { id: string; originalName: string; mimeType: string; sizeBytes: number; scanStatus: string; uploadedAt: Date; entityType: string; entityId: string; uploadedBy?: { name: string } | null }) {
    return { id: row.id, name: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, scanStatus: row.scanStatus, available: this.downloadable(row), uploadedAt: row.uploadedAt, uploadedBy: row.uploadedBy?.name ?? null, entityType: row.entityType, entityId: row.entityId };
  }

  async upload(projectId: string, dto: UploadDto, file: { originalname: string; mimetype?: string; buffer: Buffer; size: number } | undefined) {
    if (!file?.buffer) throw new BadRequestException('Envie um arquivo no campo "file".');
    await assertProjectOpen(this.prisma, projectId);
    if (file.size > uploadConfig().maxBytes) throw new PayloadTooLargeException(`Arquivo acima do limite de ${uploadConfig().maxBytes / 1024 / 1024} MB.`);
    // A entidade precisa existir NESTE projeto (nenhum anexo em item de outro projeto).
    const entity = dto.entityType === 'Task' ? await this.prisma.task.findFirst({ where: { id: dto.entityId, projectId }, select: { id: true, code: true } }) : await this.prisma.projectRequest.findFirst({ where: { id: dto.entityId, projectId }, select: { id: true, code: true } });
    if (!entity) throw new NotFoundException('Item não encontrado neste projeto.');
    const name = safeFileName(file.originalname);
    const inspection = await inspectFile(name, file.mimetype, file.buffer);
    if (!inspection.ok) { await this.events.record('ATTACHMENT_REJECTED', { projectId, metadata: { reason: inspection.reason, name } }); throw new UnprocessableEntityException(inspection.reason); }
    const scan = await this.scanner.scan(file.buffer, name);
    if (scan.status === 'INFECTED') { await this.events.record('ATTACHMENT_REJECTED', { projectId, metadata: { reason: 'malware', detail: scan.detail, name } }); throw new UnprocessableEntityException('O arquivo foi recusado pela verificação de segurança.'); }
    const storageKey = `${projectId}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer);
    const row = await this.prisma.attachment.create({ data: { projectId, entityType: dto.entityType, entityId: dto.entityId, originalName: name, storageKey, mimeType: inspection.mime, sizeBytes: file.buffer.length, sha256: sha256(file.buffer),
      scanStatus: scan.status === 'CLEAN' ? 'CLEAN' : scan.status === 'ERROR' ? 'ERROR' : 'SKIPPED', scanDetail: scan.detail ?? null, uploadedByUserId: currentUserId() }, include: { uploadedBy: { select: { name: true } } } });
    await this.prisma.auditLog.create({ data: { userId: currentUserId(), projectId, entityType: dto.entityType, entityId: dto.entityId, action: 'ATTACHMENT_UPLOADED', actorType: currentRole(), newValue: { attachmentId: row.id, name, sizeBytes: row.sizeBytes, sha256: row.sha256, code: entity.code } } });
    await this.events.record('ATTACHMENT_UPLOADED', { projectId, metadata: { attachmentId: row.id, scan: row.scanStatus } });
    return this.present(row);
  }

  async list(projectId: string, entityType?: string, entityId?: string) {
    const rows = await this.prisma.attachment.findMany({ where: { projectId, ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) }, orderBy: { uploadedAt: 'desc' }, take: 200, include: { uploadedBy: { select: { name: true } } } });
    return rows.map((row) => this.present(row));
  }

  /** Download autenticado (vínculo validado pelo guard do :projectId); o anexo precisa pertencer a este projeto e estar liberado pela verificação. */
  async download(projectId: string, id: string) {
    const row = await this.prisma.attachment.findFirst({ where: { id, projectId } });
    if (!row) throw new NotFoundException('Anexo não encontrado neste projeto.');
    if (!this.downloadable(row)) throw new ConflictException('Anexo indisponível: aguardando ou reprovado na verificação de segurança.');
    const data = await this.storage.get(row.storageKey);
    await this.events.record('SENSITIVE_DOWNLOAD', { projectId, metadata: { attachmentId: row.id, name: row.originalName } });
    return { data, name: row.originalName, mime: row.mimeType };
  }
}
