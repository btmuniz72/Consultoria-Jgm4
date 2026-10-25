import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { currentUser } from '../approvals/authority';
import { AuditQuery, DetailQuery, HoursQuery, ReportsData } from './reports-data';
import { ReportsService } from './reports.service';
import { SecurityEventsService } from '../security/security-events.service';
import { RateLimit } from '../security/rate-limiter';
import { ReportDoc, fmtDate, reportFileName } from './report-doc';
import { renderPdf } from './pdf-renderer';
import { XColumn, buildXlsx } from './xlsx-builder';

const ACTION_PLAN: XColumn[] = [
  { header: 'Código', key: 'code', width: 10 }, { header: 'Fase', key: 'phase', width: 26 }, { header: 'Atividade', key: 'title', width: 34 }, { header: 'Descrição', key: 'description', width: 44 },
  { header: 'Responsável', key: 'responsible', width: 22 }, { header: 'Organização', key: 'organization', width: 14 }, { header: 'Status', key: 'status', width: 24 }, { header: 'Prioridade', key: 'priority', width: 11 },
  { header: 'Início planejado', key: 'plannedStart', width: 14, kind: 'date' }, { header: 'Fim planejado', key: 'plannedEnd', width: 14, kind: 'date' }, { header: 'Início real', key: 'actualStart', width: 14, kind: 'date' }, { header: 'Fim real', key: 'actualEnd', width: 14, kind: 'date' },
  { header: 'Próxima ação', key: 'nextAction', width: 44 }, { header: 'Responsável pela próxima ação', key: 'nextOwner', width: 18 }, { header: 'Prazo da próxima ação', key: 'nextDue', width: 14, kind: 'date' },
  { header: 'Horas JGM4 planejadas', key: 'jgm4Planned', width: 14, kind: 'hours' }, { header: 'Horas JGM4 realizadas', key: 'jgm4Actual', width: 14, kind: 'hours' },
  { header: 'Horas Cliente planejadas', key: 'clientPlanned', width: 14, kind: 'hours' }, { header: 'Horas Cliente realizadas', key: 'clientActual', width: 14, kind: 'hours' },
  { header: 'Dependências', key: 'dependencies', width: 32 }, { header: 'Observações', key: 'notes', width: 30 },
];
const HOURS: XColumn[] = [
  { header: 'Data', key: 'date', width: 12, kind: 'date' }, { header: 'Cliente', key: 'company', width: 22 }, { header: 'Projeto', key: 'project', width: 30 }, { header: 'Fase', key: 'phase', width: 26 },
  { header: 'Atividade', key: 'task', width: 36 }, { header: 'Usuário', key: 'user', width: 22 }, { header: 'Organização', key: 'organization', width: 14 }, { header: 'Horas', key: 'hours', width: 10, kind: 'hours' }, { header: 'Descrição', key: 'description', width: 50 },
];
const REQUESTS: XColumn[] = [
  { header: 'Código', key: 'code', width: 10 }, { header: 'Solicitação', key: 'title', width: 44 }, { header: 'Fase', key: 'phase', width: 26 }, { header: 'Status', key: 'status', width: 22 }, { header: 'Responsável', key: 'responsible', width: 22 },
  { header: 'Criada em', key: 'createdAt', width: 14, kind: 'date' }, { header: 'Solicitada em', key: 'requestedAt', width: 14, kind: 'date' }, { header: 'Enviada em', key: 'sentAt', width: 14, kind: 'date' }, { header: 'Aceita em', key: 'acceptedAt', width: 14, kind: 'date' },
  { header: 'Prazo', key: 'dueDate', width: 14, kind: 'date' }, { header: 'Atraso (dias)', key: 'lateDays', width: 12, kind: 'int' }, { header: 'Resultado', key: 'result', width: 20 },
];
const AUDIT: XColumn[] = [
  { header: 'Data/hora', key: 'at', width: 18, kind: 'datetime' }, { header: 'Usuário', key: 'user', width: 24 }, { header: 'Perfil', key: 'role', width: 20 }, { header: 'Ação', key: 'action', width: 30 },
  { header: 'Entidade', key: 'entity', width: 28 }, { header: 'Valor anterior', key: 'before', width: 40 }, { header: 'Valor novo', key: 'after', width: 50 }, { header: 'Contexto', key: 'context', width: 40 },
];
const PREVIEW = {
  'action-plan': [{ key: 'code', label: 'Código' }, { key: 'phase', label: 'Fase', weight: 2 }, { key: 'title', label: 'Atividade', weight: 3 }, { key: 'status', label: 'Status', weight: 2 }, { key: 'nextAction', label: 'Próxima ação', weight: 3 }, { key: 'nextDue', label: 'Prazo' }],
  hours: [{ key: 'date', label: 'Data' }, { key: 'phase', label: 'Fase', weight: 2 }, { key: 'task', label: 'Atividade', weight: 3 }, { key: 'user', label: 'Usuário', weight: 1.6 }, { key: 'organization', label: 'Org.' }, { key: 'hours', label: 'Horas' }],
  requests: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Solicitação', weight: 3 }, { key: 'status', label: 'Status', weight: 1.6 }, { key: 'dueDate', label: 'Prazo' }, { key: 'lateDays', label: 'Atraso' }, { key: 'result', label: 'Resultado', weight: 1.4 }],
};
const disposition = (fileName: string) => `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Todas as rotas passam pelo ProjectAccessGuard (vínculo + empresa pelo :projectId) e por @Roles.
// Prévias (JSON) não geram registro; cada download (PDF/XLSX) grava o ReportGenerationLog.
@Controller('projects/:projectId')
@Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER')
@RateLimit('export', 60, 600)
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly data: ReportsData, private readonly events: SecurityEventsService) {}

  private async pdf(res: Response, projectId: string, type: string, doc: ReportDoc, parameters?: Record<string, unknown>) {
    const buffer = await renderPdf(doc);
    await this.reports.logExport(projectId, type, 'PDF', doc.fileName, parameters);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposition(doc.fileName), 'Cache-Control': 'private, no-store', 'Content-Length': String(buffer.length) }).send(buffer);
  }
  private async xlsx(res: Response, projectId: string, type: string, fileName: string, buffer: Buffer, parameters?: Record<string, unknown>) {
    await this.reports.logExport(projectId, type, 'XLSX', fileName, parameters);
    res.set({ 'Content-Type': XLSX_TYPE, 'Content-Disposition': disposition(fileName), 'Cache-Control': 'private, no-store', 'Content-Length': String(buffer.length) }).send(buffer);
  }
  private creator() { return `JGM4 Projects — ${currentUser()?.name ?? 'sistema'}`; }
  private async fileName(projectId: string, document: string) {
    const project = await this.data.project(projectId);
    return reportFileName({ company: project.company.name, methodology: project.methodology }, document, 'xlsx');
  }

  @Get('reports/history') history(@Param('projectId', ParseUUIDPipe) id: string) { return this.data.history(id); }

  @Get('reports/executive') executive(@Param('projectId', ParseUUIDPipe) id: string, @Query() query: DetailQuery) { return this.reports.executive(id, query.detail === 'true'); }
  @Get('reports/executive/pdf') async executivePdf(@Param('projectId', ParseUUIDPipe) id: string, @Query() query: DetailQuery, @Res() res: Response) { await this.pdf(res, id, 'EXECUTIVE', await this.reports.executive(id, query.detail === 'true'), { detail: query.detail === 'true' }); }

  @Get('reports/phases/:phaseId') phase(@Param('projectId', ParseUUIDPipe) id: string, @Param('phaseId', ParseUUIDPipe) phaseId: string) { return this.reports.phase(id, phaseId); }
  @Get('reports/phases/:phaseId/pdf') async phasePdf(@Param('projectId', ParseUUIDPipe) id: string, @Param('phaseId', ParseUUIDPipe) phaseId: string, @Res() res: Response) { await this.pdf(res, id, 'PHASE', await this.reports.phase(id, phaseId), { phaseId }); }
  @Get('reports/phases/:phaseId/closure') closure(@Param('projectId', ParseUUIDPipe) id: string, @Param('phaseId', ParseUUIDPipe) phaseId: string) { return this.reports.phaseClosure(id, phaseId); }
  @Get('reports/phases/:phaseId/closure/pdf') async closurePdf(@Param('projectId', ParseUUIDPipe) id: string, @Param('phaseId', ParseUUIDPipe) phaseId: string, @Res() res: Response) { await this.pdf(res, id, 'PHASE_CLOSURE', await this.reports.phaseClosure(id, phaseId), { phaseId }); }

  @Get('reports/gates/:gateId') gate(@Param('projectId', ParseUUIDPipe) id: string, @Param('gateId', ParseUUIDPipe) gateId: string) { return this.reports.gate(id, gateId); }
  @Get('reports/gates/:gateId/pdf') async gatePdf(@Param('projectId', ParseUUIDPipe) id: string, @Param('gateId', ParseUUIDPipe) gateId: string, @Res() res: Response) { await this.pdf(res, id, 'GATE', await this.reports.gate(id, gateId), { gateId }); }

  @Get('reports/final') final(@Param('projectId', ParseUUIDPipe) id: string) { return this.reports.final(id); }
  @Get('reports/final/pdf') async finalPdf(@Param('projectId', ParseUUIDPipe) id: string, @Res() res: Response) { await this.pdf(res, id, 'FINAL', await this.reports.final(id)); }

  @Get('reports/action-plan') async actionPlanDoc(@Param('projectId', ParseUUIDPipe) id: string) {
    return this.reports.tableDoc(id, 'action-plan', await this.data.actionPlan(id), PREVIEW['action-plan'], 'Plano de Ação', 'Plano de Acao');
  }
  @Get('reports/action-plan/xlsx') async actionPlanXlsx(@Param('projectId', ParseUUIDPipe) id: string, @Res() res: Response) {
    const rows = await this.data.actionPlan(id);
    await this.xlsx(res, id, 'ACTION_PLAN', await this.fileName(id, 'Plano de Acao'), await buildXlsx(this.creator(), [{ name: 'Plano de Ação', columns: ACTION_PLAN, rows }]));
  }

  @Get('reports/hours') async hoursDoc(@Param('projectId', ParseUUIDPipe) id: string, @Query() query: HoursQuery) {
    return this.reports.tableDoc(id, 'hours', (await this.data.hours(id, query)).map((row) => ({ ...row, date: fmtDate(row.date) })), PREVIEW.hours, 'Relatório de Horas', 'Relatorio de Horas');
  }
  @Get('reports/hours/xlsx') async hoursXlsx(@Param('projectId', ParseUUIDPipe) id: string, @Query() query: HoursQuery, @Res() res: Response) {
    const rows = await this.data.hours(id, query);
    const totals = ['JGM4', 'Cliente'].map((organization) => ({ organization, hours: Math.round(rows.filter((row) => row.organization === organization).reduce((sum, row) => sum + row.hours, 0) * 100) / 100 }));
    await this.xlsx(res, id, 'HOURS', await this.fileName(id, 'Relatorio de Horas'), await buildXlsx(this.creator(), [{ name: 'Horas', columns: HOURS, rows }, { name: 'Totais', columns: [{ header: 'Organização', key: 'organization', width: 18 }, { header: 'Horas', key: 'hours', width: 12, kind: 'hours' }], rows: totals }]), { ...query });
  }

  @Get('reports/requests') async requestsDoc(@Param('projectId', ParseUUIDPipe) id: string) {
    return this.reports.tableDoc(id, 'requests', await this.data.requestsHistory(id), PREVIEW.requests, 'Histórico de Solicitações', 'Historico de Solicitacoes');
  }
  @Get('reports/requests/xlsx') async requestsXlsx(@Param('projectId', ParseUUIDPipe) id: string, @Res() res: Response) {
    await this.xlsx(res, id, 'REQUESTS', await this.fileName(id, 'Historico de Solicitacoes'), await buildXlsx(this.creator(), [{ name: 'Solicitações', columns: REQUESTS, rows: await this.data.requestsHistory(id) }]));
  }

  // Auditoria: leitura e exportação apenas (AuditLog é imutável). Perfis: JGM4 e patrocinador.
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR') @Get('audit') audit(@Param('projectId', ParseUUIDPipe) id: string, @Query() query: AuditQuery) { return this.data.audit(id, query); }
  @Roles('JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR') @Get('audit/xlsx') async auditXlsx(@Param('projectId', ParseUUIDPipe) id: string, @Query() query: AuditQuery, @Res() res: Response) {
    const { items } = await this.data.audit(id, query, true);
    await this.events.record('SENSITIVE_DOWNLOAD', { projectId: id, metadata: { report: 'AUDIT', rows: items.length } });
    await this.xlsx(res, id, 'AUDIT', await this.fileName(id, 'Auditoria'), await buildXlsx(this.creator(), [{ name: 'Auditoria', columns: AUDIT, rows: items }]), { ...query });
  }
}
