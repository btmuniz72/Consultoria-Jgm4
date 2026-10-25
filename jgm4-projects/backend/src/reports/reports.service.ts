import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { RawProject, daysLate, startOfDay } from '../dashboard/dashboard.calc';
import { currentRole, currentUser, currentUserId } from '../approvals/authority';
import { SecurityEventsService } from '../security/security-events.service';
import { roleLabel, TYPE_LABELS } from '../approvals/approval-labels';
import { ReportsData } from './reports-data';
import { ReportDoc, Section, fmtDate, fmtDateTime, hoursText, label, reportFileName, statusLabels } from './report-doc';

type Dash = ReturnType<DashboardService['build']>;
type ActionRow = Dash['nextActions'][number];
interface Ctx { project: { id: string; name: string; description: string; status: string; methodology: string; actualEndDate: Date | null; company: { name: string } }; emittedAt: Date; emittedBy: string }
const PRIORITY_WEIGHT: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const owner = (row: { owner: { label: string } }) => row.owner.label;
const dueText = (date: string | null) => (date ? fmtDate(date) : 'Sem prazo');
/** "C12 — Título" sem repetir o código quando o título já o contém (ex.: alterações). */
const itemName = (code: string, title: string) => (title.startsWith(code) ? title : `${code} — ${title}`);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly dashboard: DashboardService, private readonly data: ReportsData, private readonly events: SecurityEventsService) {}

  // ---------------------------------------------------------------- utilidades
  private async ctx(projectId: string): Promise<Ctx> {
    const project = await this.data.project(projectId);
    const actor = currentUser();
    return { project, emittedAt: new Date(), emittedBy: actor?.name ?? currentRole() };
  }
  private doc(ctx: Ctx, type: string, title: string, subtitle: string | undefined, fileName: string, sections: Section[]): ReportDoc {
    return { type, title, subtitle, fileName, project: { id: ctx.project.id, name: ctx.project.name, company: ctx.project.company.name, methodology: ctx.project.methodology },
      emittedAt: ctx.emittedAt.toISOString(), emittedBy: ctx.emittedBy, sections };
  }
  private name(ctx: Ctx, type: string, document: string, ext: 'pdf' | 'xlsx', date?: string) {
    return reportFileName({ company: ctx.project.company.name, methodology: ctx.project.methodology }, document, ext, date);
  }
  private today() { return new Date().toISOString().slice(0, 10); }
  private async lastStatusEvent(projectId: string, to: 'ON_HOLD' | 'CANCELLED') {
    return this.prisma.projectStatusEvent.findFirst({ where: { projectId, toStatus: to }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }
  /** Aviso de projeto suspenso/cancelado (Etapa 7, itens 31–32). */
  private async statusCallout(ctx: Ctx): Promise<Section[]> {
    const status = ctx.project.status;
    if (status !== 'ON_HOLD' && status !== 'CANCELLED') return [];
    const event = await this.lastStatusEvent(ctx.project.id, status);
    const lines = [`Motivo: ${event?.reason ?? 'não registrado'}`, `Data: ${fmtDate(event?.effectiveDate)}`, ...(event?.note ? [`Observação: ${event.note}`] : []),
      ...(status === 'ON_HOLD' ? [`Previsão de retomada: ${event?.expectedResumeDate ? fmtDate(event.expectedResumeDate) : 'não informada'}`] : [])];
    return [{ type: 'callout', variant: 'warning', title: status === 'ON_HOLD' ? 'Projeto temporariamente suspenso' : 'Projeto cancelado — somente consulta', lines }];
  }
  private people(d: Dash) {
    return [['Consultor JGM4', d.project.consultants.join(', ') || 'A definir'], ['Patrocinador do cliente', d.project.sponsors.join(', ') || 'A definir'], ['Gestor do cliente', d.project.clientManagers.join(', ') || 'A definir']] as [string, string][];
  }

  /** Gates com critérios, recalculando os automáticos (atividades/solicitações) a partir do dado atual. */
  private async gates(projectId: string, raw: RawProject) {
    const gates = await this.prisma.gate.findMany({ where: { projectId }, orderBy: { phase: { order: 'asc' } }, include: { phase: { select: { id: true, order: true, name: true, status: true } }, criteria: { orderBy: { order: 'asc' } } } });
    return gates.map((gate) => {
      const tasks = raw.tasks.filter((task) => task.phaseId === gate.phaseId && task.status !== 'CANCELLED');
      const tasksDone = tasks.length > 0 && tasks.every((task) => task.status === 'COMPLETED');
      const requestsDone = raw.requests.filter((request) => request.phaseId === gate.phaseId && request.mandatory && request.blocking).every((request) => request.status === 'ACCEPTED');
      const criteria = gate.criteria.map((criterion) => ({ ...criterion, satisfied: criterion.sourceType === 'TASK' ? tasksDone : criterion.sourceType === 'REQUEST' ? requestsDone : criterion.satisfied }));
      const pending: string[] = criteria.filter((criterion) => criterion.mandatory && !criterion.satisfied).map((criterion) => `Critério pendente: ${criterion.description}`);
      const open = tasks.filter((task) => task.status !== 'COMPLETED');
      if (open.length) pending.push(`Atividades não concluídas: ${open.map((task) => task.code).join(', ')}`);
      const blocking = raw.requests.filter((request) => request.phaseId === gate.phaseId && request.mandatory && request.blocking && request.status !== 'ACCEPTED');
      if (blocking.length) pending.push(`Solicitações bloqueantes não aceitas: ${blocking.map((request) => request.code).join(', ')}`);
      if (gate.status === 'CORRECTION_REQUIRED' && gate.correctionInstructions) pending.push(`Correção solicitada: ${gate.correctionReason ?? ''} — ${gate.correctionInstructions}`);
      return { ...gate, criteria, satisfied: criteria.filter((criterion) => criterion.satisfied).length, pending: gate.status === 'APPROVED' ? [] : pending };
    });
  }
  private gateCallouts(gate: Awaited<ReturnType<ReportsService['gates']>>[number], names: Map<string, { name: string; role: string }>): Section[] {
    const who = (id: string | null) => (id ? `${names.get(id)?.name ?? '—'} (${roleLabel(names.get(id)?.role, 'cliente')})` : '—');
    return [
      { type: 'callout', variant: 'technical', title: 'PARECER TÉCNICO JGM4', lines: gate.technicalRecommendation
        ? [`Recomendação: ${label(statusLabels.recommendation, gate.technicalRecommendation)}`, `Parecer: ${gate.technicalOpinion ?? '—'}`, `Emitido por: ${who(gate.technicalApprovedByUserId)} em ${fmtDateTime(gate.technicalApprovedAt)}`]
        : ['Parecer técnico ainda não emitido.'] },
      { type: 'callout', variant: 'client', title: 'DECISÃO DO CLIENTE', lines: gate.clientDecision
        ? [`Decisão: ${label(statusLabels.decision, gate.clientDecision)}`, `Comentário: ${gate.clientDecisionComment ?? '—'}`, `Decidido por: ${who(gate.clientDecisionByUserId)} em ${fmtDateTime(gate.clientDecisionAt)}`]
        : ['Decisão do cliente ainda não registrada.'] },
    ];
  }

  /** Pendências determinísticas: atrasos, prioridade alta/crítica, Gate em correção, aprovações abertas e bloqueios da fase atual. */
  private async pendencies(projectId: string, raw: RawProject, d: Dash, gates: Awaited<ReturnType<ReportsService['gates']>>) {
    const map = new Map<string, { code: string; title: string; reasons: string[]; owner: string; dueDate: string | null; priority: string }>();
    const add = (key: string, row: { code: string; title: string; owner: string; dueDate: string | null; priority: string }, reason: string) => {
      const existing = map.get(key);
      if (existing) { if (!existing.reasons.includes(reason)) existing.reasons.push(reason); if ((PRIORITY_WEIGHT[row.priority] ?? 9) < (PRIORITY_WEIGHT[existing.priority] ?? 9)) existing.priority = row.priority; }
      else map.set(key, { ...row, reasons: [reason] });
    };
    const rowOf = (item: ActionRow) => ({ code: item.code, title: item.title, owner: owner(item), dueDate: item.dueDate, priority: item.priority });
    for (const item of d.delays.items) add(`${item.kind}:${item.entityId}:${item.approvalId ?? ''}`, rowOf(item), `Atrasado ${item.daysLate} ${item.daysLate === 1 ? 'dia' : 'dias'}`);
    for (const item of d.criticalPending) add(`${item.kind}:${item.entityId}:${item.approvalId ?? ''}`, rowOf(item), `Prioridade ${label(statusLabels.priority, item.priority).toLowerCase()}`);
    for (const gate of gates.filter((candidate) => candidate.status === 'CORRECTION_REQUIRED')) add(`GATE:${gate.id}:`, { code: gate.code, title: gate.title, owner: 'Cliente', dueDate: gate.nextActionDueDate?.toISOString().slice(0, 10) ?? null, priority: 'HIGH' }, 'Gate com correção solicitada');
    // Aprovações de solicitação/atividade/Gate já aparecem pela própria entidade (mesma chave); só as alterações têm item próprio.
    const approvalKey = (approval: RawProject['approvals'][number]) => (approval.type === 'TASK_VALIDATION' ? `TASK:${approval.entityId}:` : approval.type === 'REQUEST_REVIEW' ? `REQUEST:${approval.entityId}:` : approval.type.startsWith('GATE_') ? `GATE:${approval.entityId}:` : `CHANGE:${approval.entityId}:${approval.id}`);
    for (const approval of raw.approvals) add(approvalKey(approval), { code: approval.entityCode ?? '—', title: approval.title, owner: approval.assignedRole?.startsWith('CLIENT') ? 'Cliente' : 'JGM4', dueDate: approval.dueAt?.toISOString().slice(0, 10) ?? null, priority: approval.priority }, `Aprovação pendente: ${label(TYPE_LABELS, approval.type)}`);
    if (d.currentPhase) {
      const blocked = await this.prisma.task.findMany({ where: { projectId, phaseId: d.currentPhase.id, status: 'BLOCKED' }, select: { id: true, code: true, title: true, predecessor: { select: { code: true, status: true } },
        requests: { where: { mandatory: true, blocking: true, status: { not: 'ACCEPTED' } }, select: { code: true } } } });
      for (const task of blocked) {
        const blockers = [...task.requests.map((request) => `solicitação ${request.code}`), ...(task.predecessor && task.predecessor.status !== 'COMPLETED' ? [`atividade ${task.predecessor.code}`] : [])];
        if (blockers.length) add(`TASK:${task.id}:`, { code: task.code, title: task.title, owner: 'Sistema', dueDate: null, priority: 'NORMAL' }, `Bloqueada por ${blockers.join(' e ')}`);
      }
    }
    return [...map.values()].sort((a, b) => (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.code.localeCompare(b.code))
      .map((item) => ({ item: itemName(item.code, item.title), reason: item.reasons.join('; '), owner: item.owner, due: dueText(item.dueDate), priority: label(statusLabels.priority, item.priority) }));
  }
  private risks(d: Dash, raw: RawProject) {
    const risks = [...d.health.reasons];
    const blocked = raw.tasks.filter((task) => task.status === 'BLOCKED' && raw.phases.find((phase) => phase.id === task.phaseId)?.id === d.currentPhase?.id).length;
    if (blocked) risks.push(`${blocked} ${blocked === 1 ? 'atividade bloqueada' : 'atividades bloqueadas'} na fase atual aguardando dependências.`);
    for (const approval of raw.approvals.filter((item) => item.type === 'DUE_DATE_CHANGE')) risks.push(`Alteração de prazo pendente de decisão em ${approval.entityCode ?? 'atividade'}.`);
    if (!d.schedule.forecastEnd) risks.push('Previsão de término não definida.');
    return risks;
  }
  private nextSteps(d: Dash) {
    return [...d.nextActions].sort((a, b) => (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9) || b.daysLate - a.daysLate || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.code.localeCompare(b.code)).slice(0, 10)
      .map((item) => ({ item: itemName(item.code, item.title), action: item.nextAction, owner: owner(item), due: dueText(item.dueDate), priority: label(statusLabels.priority, item.priority) }));
  }
  private hoursTables(d: Dash): Section[] {
    const row = (name: string, b: Dash['hours']['jgm4']) => ({ org: name, planned: hoursText(b.planned), actual: hoursText(b.actual), remaining: hoursText(b.remaining), percent: `${b.percent}%`, alert: b.alert === 'NORMAL' ? '—' : b.alert === 'ATENCAO' ? 'ATENÇÃO' : 'EXCEDIDO' });
    return [
      { type: 'table', title: 'Horas (somente esforço)', columns: [{ key: 'org', label: 'Organização', weight: 1.2 }, { key: 'planned', label: 'Planejado', align: 'right' }, { key: 'actual', label: 'Realizado', align: 'right' }, { key: 'remaining', label: 'Saldo', align: 'right' }, { key: 'percent', label: '% consumido', align: 'right' }, { key: 'alert', label: 'Alerta' }],
        rows: [row('JGM4', d.hours.jgm4), row('Cliente', d.hours.client)] },
      { type: 'table', title: 'Horas por fase', columns: [{ key: 'phase', label: 'Fase', weight: 2 }, { key: 'jgm4', label: 'JGM4 (real/plan.)', align: 'right', weight: 1.4 }, { key: 'jgm4pct', label: '% JGM4', align: 'right' }, { key: 'alert', label: 'Alerta' }, { key: 'client', label: 'Cliente (real/plan.)', align: 'right', weight: 1.4 }],
        rows: d.phases.map((phase) => ({ phase: `Fase ${phase.order} — ${phase.name}`, jgm4: `${phase.jgm4.actual} / ${phase.jgm4.planned} h`, jgm4pct: `${phase.jgm4.percent}%`, alert: phase.jgm4.alert === 'NORMAL' ? '—' : phase.jgm4.alert === 'ATENCAO' ? 'ATENÇÃO' : 'EXCEDIDO', client: `${phase.client.actual} / ${phase.client.planned} h` })) },
      { type: 'paragraph', text: 'Horas medem apenas esforço (JGM4 e cliente); este relatório não contém valores financeiros.' },
    ];
  }

  // ---------------------------------------------------------------- 1. relatório executivo
  async executive(projectId: string, detail = false): Promise<ReportDoc> {
    const ctx = await this.ctx(projectId); const raw = await this.dashboard.raw(projectId); const d = this.dashboard.build(raw);
    const gates = await this.gates(projectId, raw); const users = await this.data.names(gates.flatMap((gate) => [gate.technicalApprovedByUserId, gate.clientDecisionByUserId]));
    void users;
    const inProgress = d.tasks['inProgress'] + d.tasks['waitingEvidence'] + d.tasks['waitingJgm4'] + d.tasks['adjustment'] + d.tasks['validated'];
    const currentGate = gates.find((gate) => gate.id === d.gate?.id);
    const sections: Section[] = [
      { type: 'kv', title: '1. Identificação', rows: [['Cliente', ctx.project.company.name], ['Projeto', ctx.project.name], ['Status', label(statusLabels.project, d.project.status)], ['Data de início', d.schedule.startDate ? fmtDate(d.schedule.startDate) : 'A definir'],
        ['Previsão de término', d.schedule.forecastEnd ? fmtDate(d.schedule.forecastEnd) : 'A definir'], ['Fase atual', d.currentPhase ? `Fase ${d.currentPhase.order} — ${d.currentPhase.name}` : '—'], ...this.people(d)] },
      ...(await this.statusCallout(ctx)),
      { type: 'kv', title: '2. Resumo executivo', rows: [['Progresso geral', `${d.progress.percent}% (${d.progress.completed} de ${d.progress.total} atividades concluídas)`], ['Saúde do projeto', label(statusLabels.health, d.health.level)],
        ['Gate atual', d.gate ? `Gate ${d.gate.phaseOrder} — ${d.gate.title} (${label(statusLabels.gate, d.gate.status)}; ${d.gate.satisfied}/${d.gate.total} critérios)` : 'Nenhum Gate pendente']] },
      { type: 'bullets', title: 'Motivos da saúde', items: d.health.reasons, empty: 'Nenhuma condição de atenção.' },
      { type: 'kv', title: '3. Progresso', rows: [['Atividades totais', String(d.tasks['total'])], ['Concluídas', String(d.tasks['completed'])], ['Em andamento', String(inProgress)], ['Bloqueadas', String(d.tasks['blocked'])], ['Atrasadas', String(d.tasks['overdue'])], ['Progresso geral', `${d.progress.percent}%`]] },
      { type: 'progress', title: 'Progresso por fase', items: d.phases.map((phase) => ({ label: `Fase ${phase.order} — ${phase.name}`, percent: phase.percent, detail: `${phase.completed}/${phase.total} · ${label(statusLabels.phase, phase.status)}` })) },
      ...this.hoursTables(d).map((section, index) => (index === 0 ? { ...section, title: '4. Horas — somente esforço' } as Section : section)),
      { type: 'table', title: '5. Gates', columns: [{ key: 'gate', label: 'Gate', weight: 2 }, { key: 'status', label: 'Status', weight: 1.4 }, { key: 'criteria', label: 'Critérios', align: 'center' }, { key: 'approvedAt', label: 'Aprovação' }, { key: 'opinion', label: 'Parecer técnico JGM4', weight: 2.4 }, { key: 'decision', label: 'Decisão do cliente', weight: 1.8 }],
        rows: gates.map((gate) => ({ gate: `${gate.code} — ${gate.title}`, status: label(statusLabels.gate, gate.status), criteria: `${gate.satisfied}/${gate.criteria.length}`, approvedAt: gate.status === 'APPROVED' ? fmtDate(gate.clientDecisionAt) : '—',
          opinion: gate.technicalRecommendation ? `${label(statusLabels.recommendation, gate.technicalRecommendation)}${gate.technicalOpinion ? `: ${gate.technicalOpinion}` : ''}` : '—', decision: gate.clientDecision ? label(statusLabels.decision, gate.clientDecision) : '—' })) },
      ...(currentGate && currentGate.pending.length ? [{ type: 'bullets', title: `Pendências atuais do ${currentGate.code}`, items: currentGate.pending } as Section] : []),
      { type: 'kv', title: '6. Solicitações', rows: [['Total', String(d.requests['total'])], ['Aceitas', String(d.requests['accepted'])], ['Em preparação pelo cliente', String(d.requests['waitingClient'])], ['Aguardando JGM4', String(d.requests['waitingJgm4'])], ['Ajustes solicitados', String(d.requests['adjustment'])], ['Atrasadas', String(d.requests['overdue'])]] },
      ...(detail ? [{ type: 'table', title: 'Solicitações — detalhe', columns: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Solicitação', weight: 3 }, { key: 'status', label: 'Status', weight: 1.4 }, { key: 'due', label: 'Prazo' }],
        rows: raw.requests.map((request) => ({ code: request.code, title: request.title, status: label(statusLabels.request, request.status), due: dueText(request.dueDate?.toISOString().slice(0, 10) ?? null) })) } as Section] : []),
      { type: 'table', title: '7. Principais pendências', columns: [{ key: 'item', label: 'Item', weight: 3 }, { key: 'reason', label: 'Motivo', weight: 2.6 }, { key: 'owner', label: 'Responsável', weight: 1.2 }, { key: 'due', label: 'Prazo' }, { key: 'priority', label: 'Prioridade' }],
        rows: await this.pendencies(projectId, raw, d, gates), empty: 'Nenhuma pendência relevante.' },
      { type: 'bullets', title: '8. Principais riscos', items: this.risks(d, raw), empty: 'Nenhum risco identificado pelas regras do sistema.' },
      { type: 'table', title: '9. Próximos passos (até 10)', columns: [{ key: 'item', label: 'Item', weight: 2.6 }, { key: 'action', label: 'Ação', weight: 3 }, { key: 'owner', label: 'Responsável', weight: 1.2 }, { key: 'due', label: 'Prazo' }], rows: this.nextSteps(d), empty: 'Nada pendente.' },
      { type: 'paragraph', text: 'Documento gerado automaticamente a partir dos registros do sistema. Pendências, riscos e próximos passos seguem regras determinísticas (sem uso de IA).' },
    ];
    return this.doc(ctx, 'executive', 'Relatório Executivo do Projeto', `${ctx.project.company.name} — ${ctx.project.name}`, this.name(ctx, 'executive', 'Relatorio Executivo', 'pdf', this.today()), sections);
  }

  // ---------------------------------------------------------------- 2. relatório da fase e encerramento
  private phaseRaw(raw: RawProject, phaseId: string): RawProject {
    const phase = raw.phases.find((item) => item.id === phaseId);
    if (!phase) throw new NotFoundException('Fase não encontrada neste projeto.');
    const tasks = raw.tasks.filter((task) => task.phaseId === phaseId); const requests = raw.requests.filter((request) => request.phaseId === phaseId); const gates = raw.gates.filter((gate) => gate.phaseId === phaseId);
    const ids = new Set([...tasks.map((task) => task.id), ...requests.map((request) => request.id), ...gates.map((gate) => gate.id)]);
    return { ...raw, phases: [phase], tasks, requests, gates, approvals: raw.approvals.filter((approval) => ids.has(approval.entityId)), hours: raw.hours.filter((entry) => entry.phaseId === phaseId) };
  }
  private async phaseData(projectId: string, phaseId: string) {
    const ctx = await this.ctx(projectId); const fullRaw = await this.dashboard.raw(projectId); const raw = this.phaseRaw(fullRaw, phaseId); const d = this.dashboard.build(raw);
    const [phase, tasks, gates] = await Promise.all([
      this.prisma.phase.findFirstOrThrow({ where: { id: phaseId, projectId } }),
      this.prisma.task.findMany({ where: { projectId, phaseId }, orderBy: { code: 'asc' }, select: { code: true, title: true, status: true, currentOwnerType: true, plannedStartDate: true, plannedEndDate: true, nextActionDueDate: true, actualEndDate: true } }),
      this.gates(projectId, fullRaw),
    ]);
    return { ctx, fullRaw, raw, d, phase, tasks, gate: gates.find((item) => item.phaseId === phaseId) ?? null, gates };
  }
  private phaseBaseSections(x: Awaited<ReturnType<ReportsService['phaseData']>>): Section[] {
    const { d, phase, tasks } = x;
    const dates = (key: 'plannedStartDate' | 'plannedEndDate') => tasks.map((task) => task[key]).filter((value): value is Date => !!value).sort((a, b) => a.getTime() - b.getTime());
    const starts = dates('plannedStartDate'); const ends = dates('plannedEndDate');
    return [
      { type: 'kv', title: 'Identificação da fase', rows: [['Fase', `Fase ${phase.order} — ${phase.name}`], ['Descrição', phase.description], ['Status', label(statusLabels.phase, phase.status)],
        ['Período planejado', starts.length && ends.length ? `${fmtDate(starts[0])} a ${fmtDate(ends[ends.length - 1])} (${phase.plannedWeeks} semanas-base)` : `${phase.plannedWeeks} semanas-base (datas por atividade a definir)`],
        ['Período realizado', phase.actualStartDate ? `${fmtDate(phase.actualStartDate)} a ${phase.actualEndDate ? fmtDate(phase.actualEndDate) : 'em andamento'}` : 'Ainda não iniciada']] },
      { type: 'progress', title: 'Progresso da fase', items: [{ label: `Fase ${phase.order} — ${phase.name}`, percent: d.progress.percent, detail: `${d.progress.completed}/${d.progress.total} atividades` }] },
      { type: 'table', title: 'Atividades', columns: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Atividade', weight: 3 }, { key: 'status', label: 'Status', weight: 1.6 }, { key: 'owner', label: 'Responsável' }, { key: 'due', label: 'Prazo' }, { key: 'done', label: 'Concluída em' }],
        rows: tasks.map((task) => ({ code: task.code, title: task.title, status: label(statusLabels.task, task.status), owner: task.currentOwnerType === 'JGM4' ? 'JGM4' : task.currentOwnerType === 'CLIENT' ? 'Cliente' : '—', due: fmtDate(task.nextActionDueDate ?? task.plannedEndDate), done: fmtDate(task.actualEndDate) })) },
      ...this.hoursTables(d).slice(0, 1),
      { type: 'table', title: 'Solicitações da fase', columns: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Solicitação', weight: 3 }, { key: 'status', label: 'Status', weight: 1.4 }, { key: 'due', label: 'Prazo' }],
        rows: x.raw.requests.map((request) => ({ code: request.code, title: request.title, status: label(statusLabels.request, request.status), due: dueText(request.dueDate?.toISOString().slice(0, 10) ?? null) })), empty: 'Nenhuma solicitação nesta fase.' },
    ];
  }

  async phase(projectId: string, phaseId: string): Promise<ReportDoc> {
    const x = await this.phaseData(projectId, phaseId); const { d, ctx, phase } = x;
    const users = await this.data.names(x.gate ? [x.gate.technicalApprovedByUserId, x.gate.clientDecisionByUserId] : []);
    const sections: Section[] = [...this.phaseBaseSections(x),
      { type: 'table', title: 'Pendências', columns: [{ key: 'item', label: 'Item', weight: 3 }, { key: 'reason', label: 'Motivo', weight: 2.6 }, { key: 'owner', label: 'Responsável' }, { key: 'due', label: 'Prazo' }, { key: 'priority', label: 'Prioridade' }],
        rows: await this.pendencies(projectId, x.raw, d, x.gate ? [x.gate] : []), empty: 'Nenhuma pendência nesta fase.' },
      { type: 'bullets', title: 'Riscos', items: this.risks(d, x.raw), empty: 'Nenhum risco identificado pelas regras do sistema.' },
      ...(x.gate ? [{ type: 'kv', title: `Gate da fase — ${x.gate.code}`, rows: [['Título', x.gate.title], ['Pergunta de decisão', x.gate.question], ['Status', label(statusLabels.gate, x.gate.status)], ['Critérios atendidos', `${x.gate.satisfied}/${x.gate.criteria.length}`]] } as Section,
        ...(x.gate.pending.length ? [{ type: 'bullets', title: 'Pendências do Gate', items: x.gate.pending } as Section] : []), ...this.gateCallouts(x.gate, users)] : []),
      { type: 'table', title: 'Próximos passos', columns: [{ key: 'item', label: 'Item', weight: 2.6 }, { key: 'action', label: 'Ação', weight: 3 }, { key: 'owner', label: 'Responsável' }, { key: 'due', label: 'Prazo' }], rows: this.nextSteps(d), empty: 'Nada pendente nesta fase.' }];
    return this.doc(ctx, 'phase', `Relatório da Fase ${phase.order}`, `${ctx.project.company.name} — ${ctx.project.name} · Fase ${phase.order} — ${phase.name}`, this.name(ctx, 'phase', `Relatorio Fase ${phase.order}`, 'pdf'), sections);
  }

  async phaseClosure(projectId: string, phaseId: string): Promise<ReportDoc> {
    const x = await this.phaseData(projectId, phaseId); const { d, ctx, phase, gate } = x;
    if (!gate || gate.status !== 'APPROVED') throw new ConflictException('Encerramento definitivo indisponível: o Gate da fase ainda não foi aprovado.');
    const users = await this.data.names([gate.technicalApprovedByUserId, gate.clientDecisionByUserId]);
    const carried = await this.prisma.carriedOverItem.findMany({ where: { projectId, fromPhaseId: phaseId }, orderBy: { createdAt: 'asc' }, include: { toPhase: { select: { order: true, name: true } } } });
    const deviations: string[] = [];
    for (const task of x.tasks) {
      if (task.status === 'COMPLETED' && task.actualEndDate && task.plannedEndDate && task.actualEndDate.getTime() > task.plannedEndDate.getTime()) {
        const late = Math.round((startOfDay(task.actualEndDate).getTime() - task.plannedEndDate.getTime()) / 86400000);
        if (late > 0) deviations.push(`${task.code} concluída ${late} ${late === 1 ? 'dia' : 'dias'} após o prazo planejado.`);
      }
      if (task.status === 'CANCELLED') deviations.push(`${task.code} cancelada.`);
    }
    for (const [org, block] of [['JGM4', d.hours.jgm4], ['Cliente', d.hours.client]] as const) if (block.alert === 'EXCEDIDO') deviations.push(`Horas ${org} acima do planejado: ${hoursText(block.actual)} de ${hoursText(block.planned)}.`);
    for (const request of x.raw.requests.filter((item) => item.status === 'CANCELLED')) deviations.push(`Solicitação ${request.code} cancelada.`);
    const sections: Section[] = [
      { type: 'callout', variant: 'info', title: 'Encerramento da fase', lines: [`Gate ${gate.code} aprovado em ${fmtDate(gate.clientDecisionAt)}.`, 'Registro gerado a partir do workflow autenticado do sistema; sem assinatura eletrônica.'] },
      { type: 'kv', title: 'Fase e objetivos', rows: [['Fase', `Fase ${phase.order} — ${phase.name}`], ['Objetivos', phase.description], ['Pergunta de decisão do Gate', gate.question], ['Período realizado', phase.actualStartDate ? `${fmtDate(phase.actualStartDate)} a ${fmtDate(phase.actualEndDate)}` : '—']] },
      { type: 'table', title: 'Atividades concluídas', columns: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Atividade', weight: 3 }, { key: 'done', label: 'Concluída em' }],
        rows: x.tasks.filter((task) => task.status === 'COMPLETED').map((task) => ({ code: task.code, title: task.title, done: fmtDate(task.actualEndDate) })), empty: 'Nenhuma atividade concluída.' },
      ...this.hoursTables(d).slice(0, 1),
      { type: 'bullets', title: 'Desvios', items: deviations, empty: 'Nenhum desvio relevante registrado.' },
      { type: 'table', title: 'Solicitações', columns: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Solicitação', weight: 3 }, { key: 'status', label: 'Status', weight: 1.4 }],
        rows: x.raw.requests.map((request) => ({ code: request.code, title: request.title, status: label(statusLabels.request, request.status) })), empty: 'Nenhuma solicitação nesta fase.' },
      ...this.gateCallouts(gate, users),
      { type: 'table', title: 'Pendências transferidas', columns: [{ key: 'description', label: 'Descrição', weight: 3 }, { key: 'responsible', label: 'Responsável', weight: 1.4 }, { key: 'due', label: 'Prazo' }, { key: 'to', label: 'Fase de destino', weight: 1.4 }, { key: 'status', label: 'Situação' }],
        rows: carried.map((item) => ({ description: item.description, responsible: item.responsible, due: fmtDate(item.dueDate), to: `Fase ${item.toPhase.order} — ${item.toPhase.name}`, status: item.status === 'OPEN' ? 'Em aberto' : 'Resolvida' })), empty: 'Nenhuma pendência transferida.' },
    ];
    return this.doc(ctx, 'phase-closure', `Relatório de Encerramento da Fase ${phase.order}`, `${ctx.project.company.name} — ${ctx.project.name} · Fase ${phase.order} — ${phase.name}`, this.name(ctx, 'phase-closure', `Encerramento Fase ${phase.order}`, 'pdf'), sections);
  }

  // ---------------------------------------------------------------- 3. relatório do Gate (registro formal)
  async gate(projectId: string, gateId: string): Promise<ReportDoc> {
    const ctx = await this.ctx(projectId); const raw = await this.dashboard.raw(projectId);
    const gates = await this.gates(projectId, raw); const gate = gates.find((item) => item.id === gateId);
    if (!gate) throw new NotFoundException('Gate não encontrado neste projeto.');
    const [evidence, logs] = await Promise.all([
      this.prisma.taskEvidence.findMany({ where: { projectId, phaseId: gate.phaseId }, orderBy: { createdAt: 'asc' }, include: { task: { select: { code: true } } } }),
      this.prisma.auditLog.findMany({ where: { projectId, OR: [{ entityType: 'Gate', entityId: gate.id }, { entityType: 'Phase', entityId: gate.phaseId }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    const names = await this.data.names([gate.technicalApprovedByUserId, gate.clientDecisionByUserId, ...gate.criteria.map((criterion) => criterion.satisfiedByUserId), ...evidence.map((item) => item.createdByUserId), ...logs.map((log) => log.userId)]);
    const nameOf = (id: string | null) => (id ? names.get(id)?.name ?? '—' : '—');
    const involved = new Map<string, { name: string; role: string; actions: number }>();
    for (const log of logs) if (log.userId) { const user = names.get(log.userId); const entry = involved.get(log.userId) ?? { name: user?.name ?? '—', role: roleLabel(user?.role, ctx.project.company.name), actions: 0 }; entry.actions++; involved.set(log.userId, entry); }
    const phaseTasks = raw.tasks.filter((task) => task.phaseId === gate.phaseId);
    const sections: Section[] = [
      { type: 'kv', title: 'Identificação do registro', rows: [['Cliente', ctx.project.company.name], ['Projeto', ctx.project.name], ['Fase', `Fase ${gate.phase.order} — ${gate.phase.name}`], ['Gate', `${gate.code} — ${gate.title}`], ['Status do Gate', label(statusLabels.gate, gate.status)], ['Critérios atendidos', `${gate.satisfied}/${gate.criteria.length}`]] },
      { type: 'paragraph', title: 'Pergunta de decisão', text: gate.question },
      { type: 'table', title: 'Critérios', columns: [{ key: 'code', label: 'Código' }, { key: 'description', label: 'Critério', weight: 3 }, { key: 'source', label: 'Origem' }, { key: 'met', label: 'Atendido', align: 'center' }, { key: 'evidence', label: 'Evidência', weight: 1.6 }, { key: 'by', label: 'Atendido por/em', weight: 1.6 }],
        rows: gate.criteria.map((criterion) => ({ code: criterion.code, description: criterion.description + (criterion.mandatory ? '' : ' (opcional)'), source: label(statusLabels.source, criterion.sourceType), met: criterion.satisfied ? 'Sim' : 'Não',
          evidence: criterion.evidenceReference ?? (criterion.sourceType === 'TASK' || criterion.sourceType === 'REQUEST' ? 'Verificação automática' : '—'), by: criterion.satisfiedAt && criterion.sourceType !== 'TASK' && criterion.sourceType !== 'REQUEST' ? `${nameOf(criterion.satisfiedByUserId)} · ${fmtDate(criterion.satisfiedAt)}` : '—' })) },
      { type: 'table', title: 'Evidências registradas nas atividades da fase', columns: [{ key: 'task', label: 'Atividade' }, { key: 'description', label: 'Evidência', weight: 3 }, { key: 'link', label: 'Referência', weight: 1.6 }, { key: 'by', label: 'Registrada por' }, { key: 'at', label: 'Data' }],
        rows: evidence.map((item) => ({ task: item.task.code, description: item.description, link: item.referenceUrl ?? '—', by: nameOf(item.createdByUserId), at: fmtDate(item.createdAt) })), empty: 'Nenhuma evidência registrada.' },
      { type: 'table', title: 'Atividades da fase', columns: [{ key: 'code', label: 'Código' }, { key: 'title', label: 'Atividade', weight: 3 }, { key: 'status', label: 'Status', weight: 1.6 }],
        rows: phaseTasks.map((task) => ({ code: task.code, title: task.title, status: label(statusLabels.task, task.status) })), empty: 'Nenhuma atividade.' },
      ...this.gateCallouts(gate, names),
      ...(gate.correctionReason ? [{ type: 'callout', variant: 'warning', title: 'Correção solicitada', lines: [`Motivo: ${gate.correctionReason}`, `Instruções: ${gate.correctionInstructions ?? '—'}`] } as Section] : []),
      ...(gate.pending.length ? [{ type: 'bullets', title: 'Pendências atuais', items: gate.pending } as Section] : []),
      { type: 'table', title: 'Usuários envolvidos', columns: [{ key: 'name', label: 'Usuário', weight: 2 }, { key: 'role', label: 'Perfil', weight: 2 }, { key: 'actions', label: 'Registros', align: 'right' }],
        rows: [...involved.values()].map((user) => ({ name: user.name, role: user.role, actions: user.actions })), empty: 'Nenhum usuário registrado.' },
      { type: 'table', title: 'Auditoria relevante', columns: [{ key: 'at', label: 'Data/hora', weight: 1.4 }, { key: 'user', label: 'Usuário', weight: 1.6 }, { key: 'action', label: 'Ação', weight: 2 }, { key: 'detail', label: 'Detalhe', weight: 3 }],
        rows: logs.map((log) => { const after = (log.newValue ?? {}) as Record<string, unknown>; const detail = [after['clientDecision'], after['technicalRecommendation'], after['status'], after['comment'], after['correctionReason']].filter((value) => typeof value === 'string' && value).join(' · ');
          return { at: fmtDateTime(log.createdAt), user: log.userId ? nameOf(log.userId) : log.actorType === 'SYSTEM' ? 'Sistema' : log.actorType, action: log.action.replaceAll('_', ' '), detail }; }), empty: 'Sem registros de auditoria.' },
      { type: 'paragraph', text: 'Registro formal gerado a partir do workflow interno autenticado. Não há assinatura eletrônica nesta versão.' },
    ];
    return this.doc(ctx, 'gate', `Registro do Gate — ${gate.code}`, `${ctx.project.company.name} — ${ctx.project.name} · ${gate.title}`, this.name(ctx, 'gate', `Gate ${gate.phase.order}`, 'pdf'), sections);
  }

  // ---------------------------------------------------------------- 4. relatório final de implantação
  async final(projectId: string): Promise<ReportDoc> {
    const ctx = await this.ctx(projectId); const raw = await this.dashboard.raw(projectId); const d = this.dashboard.build(raw);
    const gates = await this.gates(projectId, raw); const lastGate = gates[gates.length - 1];
    const completed = ctx.project.status === 'IMPLEMENTATION_COMPLETED' || ctx.project.status === 'COMPLETED';
    if (!completed || !lastGate || lastGate.status !== 'APPROVED') throw new ConflictException('Relatório Final indisponível: exige o Gate final aprovado e o projeto em "Implantação concluída".');
    const [phases, tasks, sustainment, carried, approvals, events, names] = await Promise.all([
      this.prisma.phase.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
      this.prisma.task.findMany({ where: { projectId, status: { not: 'CANCELLED' } }, orderBy: [{ phase: { order: 'asc' } }, { code: 'asc' }], select: { code: true, title: true, status: true, phaseId: true, actualEndDate: true, phase: { select: { order: true } } } }),
      this.prisma.sustainmentItem.findMany({ where: { projectId, active: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.carriedOverItem.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, include: { fromPhase: { select: { order: true } }, toPhase: { select: { order: true } } } }),
      this.prisma.approval.findMany({ where: { projectId, status: { in: ['APPROVED', 'ADJUSTMENT_REQUESTED', 'REJECTED'] } }, orderBy: { decidedAt: 'asc' } }),
      this.prisma.projectStatusEvent.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
      this.data.names(gates.flatMap((gate) => [gate.technicalApprovedByUserId, gate.clientDecisionByUserId])),
    ]);
    void names;
    const done = tasks.filter((task) => task.status === 'COMPLETED');
    const residualTasks = tasks.filter((task) => task.status !== 'COMPLETED'); const residualRequests = raw.requests.filter((request) => !['ACCEPTED', 'CANCELLED'].includes(request.status));
    const approvers = await this.data.names(approvals.map((approval) => approval.decidedByUserId));
    const sections: Section[] = [
      { type: 'kv', title: '1. Identificação', rows: [['Cliente', ctx.project.company.name], ['Projeto', ctx.project.name], ['Metodologia', ctx.project.methodology.replaceAll('_', ' ')], ['Status', label(statusLabels.project, d.project.status)], ['Início', d.schedule.startDate ? fmtDate(d.schedule.startDate) : 'A definir'],
        ['Conclusão da implantação', fmtDate(ctx.project.actualEndDate ?? lastGate.clientDecisionAt)], ...this.people(d)] },
      { type: 'paragraph', title: '2. Objetivo', text: ctx.project.description },
      { type: 'table', title: '3. Escopo executado', columns: [{ key: 'phase', label: 'Fase', weight: 2.4 }, { key: 'done', label: 'Atividades concluídas', align: 'right' }, { key: 'total', label: 'Atividades previstas', align: 'right' }, { key: 'requests', label: 'Solicitações aceitas', align: 'right' }],
        rows: d.phases.map((phase) => ({ phase: `Fase ${phase.order} — ${phase.name}`, done: phase.completed, total: phase.total, requests: raw.requests.filter((request) => request.phaseId === phase.id && request.status === 'ACCEPTED').length })) },
      { type: 'table', title: '4. Cronologia das fases', columns: [{ key: 'phase', label: 'Fase', weight: 2.4 }, { key: 'weeks', label: 'Semanas-base', align: 'right' }, { key: 'start', label: 'Início real' }, { key: 'end', label: 'Término real' }, { key: 'gate', label: 'Gate aprovado em' }],
        rows: phases.map((phase) => ({ phase: `Fase ${phase.order} — ${phase.name}`, weeks: phase.plannedWeeks, start: fmtDate(phase.actualStartDate), end: fmtDate(phase.actualEndDate), gate: fmtDate(gates.find((gate) => gate.phaseId === phase.id)?.clientDecisionAt) })) },
      { type: 'progress', title: '5. Resultados por fase', items: d.phases.map((phase) => ({ label: `Fase ${phase.order} — ${phase.name}`, percent: phase.percent, detail: `${phase.completed}/${phase.total} · JGM4 ${phase.jgm4.actual}/${phase.jgm4.planned} h` })) },
      { type: 'table', title: '6. Gates', columns: [{ key: 'gate', label: 'Gate', weight: 2 }, { key: 'criteria', label: 'Critérios', align: 'center' }, { key: 'opinion', label: 'PARECER TÉCNICO JGM4', weight: 2.6 }, { key: 'decision', label: 'DECISÃO DO CLIENTE', weight: 2.2 }, { key: 'at', label: 'Data' }],
        rows: gates.map((gate) => ({ gate: `${gate.code} — ${gate.title}`, criteria: `${gate.satisfied}/${gate.criteria.length}`, opinion: `${label(statusLabels.recommendation, gate.technicalRecommendation)}${gate.technicalOpinion ? `: ${gate.technicalOpinion}` : ''}`,
          decision: `${label(statusLabels.decision, gate.clientDecision)}${gate.clientDecisionComment ? `: ${gate.clientDecisionComment}` : ''}`, at: fmtDate(gate.clientDecisionAt) })) },
      ...this.hoursTables(d).map((section, index) => (index === 0 ? { ...section, title: '7. Horas — somente esforço' } as Section : section)),
      { type: 'table', title: '8. Principais melhorias implantadas', columns: [{ key: 'phase', label: 'Fase' }, { key: 'code', label: 'Código' }, { key: 'title', label: 'Melhoria / atividade concluída', weight: 4 }, { key: 'done', label: 'Concluída em' }],
        rows: done.map((task) => ({ phase: `Fase ${task.phase.order}`, code: task.code, title: task.title, done: fmtDate(task.actualEndDate) })), empty: 'Nenhuma atividade concluída registrada.' },
      { type: 'table', title: '9. Pendências residuais', columns: [{ key: 'kind', label: 'Tipo' }, { key: 'description', label: 'Descrição', weight: 3.4 }, { key: 'responsible', label: 'Responsável', weight: 1.4 }, { key: 'due', label: 'Prazo' }],
        rows: [...carried.filter((item) => item.status === 'OPEN').map((item) => ({ kind: 'Transferida', description: `${item.description} (Fase ${item.fromPhase.order} → Fase ${item.toPhase.order})`, responsible: item.responsible, due: fmtDate(item.dueDate) })),
          ...residualTasks.map((task) => ({ kind: 'Atividade', description: `${task.code} — ${task.title} (${label(statusLabels.task, task.status)})`, responsible: '—', due: '—' })),
          ...residualRequests.map((request) => ({ kind: 'Solicitação', description: `${request.code} — ${request.title} (${label(statusLabels.request, request.status)})`, responsible: '—', due: dueText(request.dueDate?.toISOString().slice(0, 10) ?? null) }))], empty: 'Nenhuma pendência residual registrada.' },
      { type: 'table', title: '10. Plano de sustentação', columns: [{ key: 'routine', label: 'Rotina', weight: 2.6 }, { key: 'frequency', label: 'Frequência' }, { key: 'responsible', label: 'Responsável', weight: 1.4 }, { key: 'indicator', label: 'Indicador', weight: 1.6 }, { key: 'criterion', label: 'Critério', weight: 1.8 }, { key: 'review', label: 'Próxima revisão' }],
        rows: sustainment.map((item) => ({ routine: item.routine, frequency: item.frequency, responsible: item.responsible, indicator: item.indicator ?? '—', criterion: item.criterion ?? '—', review: fmtDate(item.nextReviewDate) })), empty: 'Plano de sustentação ainda não cadastrado.' },
      { type: 'table', title: '11. Histórico de decisões', columns: [{ key: 'at', label: 'Data' }, { key: 'item', label: 'Item', weight: 2.2 }, { key: 'decision', label: 'Decisão', weight: 1.6 }, { key: 'by', label: 'Decidido por', weight: 1.6 }, { key: 'comment', label: 'Comentário', weight: 2.6 }],
        rows: [...approvals.map((approval) => ({ at: fmtDate(approval.decidedAt), item: `${approval.entityCode ?? '—'} — ${label(TYPE_LABELS, approval.type)}`, decision: approval.decision === 'APPROVED' ? 'Aprovado' : approval.decision === 'REJECTED' ? 'Rejeitado' : 'Ajuste solicitado',
          by: approval.decidedByUserId ? approvers.get(approval.decidedByUserId)?.name ?? roleLabel(approval.decidedByRole, 'cliente') : roleLabel(approval.decidedByRole, 'cliente'), comment: approval.decisionComment ?? '' })),
          ...events.map((event) => ({ at: fmtDate(event.effectiveDate), item: 'Situação do projeto', decision: `${label(statusLabels.project, event.fromStatus)} → ${label(statusLabels.project, event.toStatus)}`, by: roleLabel(event.createdByRole, 'cliente'), comment: event.reason }))], empty: 'Nenhuma decisão registrada.' },
      { type: 'paragraph', title: '12. Encerramento', text: `Implantação "${ctx.project.name}" concluída para ${ctx.project.company.name}. O Gate final (${lastGate.code}) foi aprovado em ${fmtDate(lastGate.clientDecisionAt)}; ${d.progress.completed} de ${d.progress.total} atividades foram concluídas e ${d.requests['accepted']} solicitações foram aceitas. Documento emitido em ${fmtDate(ctx.emittedAt)} a partir dos registros do sistema, sem assinatura eletrônica.` },
    ];
    return this.doc(ctx, 'final', 'Relatório Final de Implantação', `${ctx.project.company.name} — ${ctx.project.name}`, this.name(ctx, 'final', 'Relatorio Final', 'pdf'), sections);
  }

  // ---------------------------------------------------------------- prévias tabulares
  async tableDoc(projectId: string, type: 'action-plan' | 'hours' | 'requests', rows: Record<string, unknown>[], columns: { key: string; label: string; weight?: number }[], title: string, fileDoc: string): Promise<ReportDoc> {
    const ctx = await this.ctx(projectId);
    const shown = rows.slice(0, 200).map((row) => Object.fromEntries(columns.map((column) => { const value = row[column.key]; return [column.key, value instanceof Date ? fmtDate(value) : typeof value === 'number' ? value : (value as string | null) ?? '—']; })));
    return this.doc(ctx, type, title, `${ctx.project.company.name} — ${ctx.project.name}`, this.name(ctx, type, fileDoc, 'xlsx'), [
      { type: 'paragraph', text: `${rows.length} registros${rows.length > shown.length ? ` (prévia dos primeiros ${shown.length}; a exportação XLSX contém todos)` : ''}.` },
      { type: 'table', title, columns, rows: shown as Record<string, string | number | null>[], empty: 'Sem registros.' }]);
  }

  async logExport(projectId: string, reportType: string, format: 'PDF' | 'XLSX', fileName: string, parameters?: Record<string, unknown>) {
    await this.prisma.reportGenerationLog.create({ data: { projectId, reportType, format, fileName, parameters: (parameters ?? undefined) as never, generatedByUserId: currentUserId(), generatedByRole: currentRole() } });
    await this.events.record('EXPORT_GENERATED', { projectId, metadata: { reportType, format } });
  }
  daysLate = daysLate;
}
