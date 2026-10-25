// Cálculos do dashboard (Etapa 6). Funções puras: recebem os dados já carregados e a data de referência,
// o que torna as regras (progresso, horas, atraso, saúde) previsíveis e testáveis. Nada aqui grava dados,
// e nenhuma hora realizada é armazenada: o realizado vem sempre da soma de TimeEntry.
import { roleLabel } from '../approvals/approval-labels';

export const DAY_MS = 86400000;
export type HealthLevel = 'NORMAL' | 'ATENCAO' | 'CRITICO';
export type HourAlert = 'NORMAL' | 'ATENCAO' | 'EXCEDIDO';
export type Party = 'JGM4' | 'CLIENT';

export interface RawPhase { id: string; order: number; name: string; status: string; plannedWeeks: number; plannedJgm4Hours: number }
export interface RawGate { id: string; phaseId: string; code: string; title: string; status: string; currentOwnerType: string; nextAction: string | null; nextActionDueDate: Date | null;
  criteria: { sourceType: string | null; satisfied: boolean; mandatory: boolean }[] }
export interface RawTask { id: string; phaseId: string; code: string; title: string; status: string; currentOwnerType: string; nextAction: string | null; nextActionDueDate: Date | null;
  plannedStartDate: Date | null; plannedEndDate: Date | null; actualStartDate: Date | null; plannedJgm4Hours: number; plannedClientHours: number; responsibilityType: string;
  clientResponsibleUserId: string | null; jgm4ResponsibleUserId: string | null }
export interface RawRequest { id: string; phaseId: string; code: string; title: string; status: string; dueDate: Date | null; mandatory: boolean; blocking: boolean; clientResponsibleId: string | null }
export interface RawApproval { id: string; type: string; entityType: string; entityId: string; entityCode: string | null; title: string; priority: string; dueAt: Date | null; assignedRole: string | null; requestedAt: Date }
export interface RawHours { phaseId: string; org: 'JGM4' | 'CLIENT'; hours: number }
export interface RawMember { userId: string; name: string; role: string }
export interface RawProject {
  project: { id: string; name: string; description: string; status: string; plannedStartDate: Date | null; plannedEndDate: Date | null; company: { id: string; name: string }; sponsorName: string | null };
  phases: RawPhase[]; gates: RawGate[]; tasks: RawTask[]; requests: RawRequest[]; approvals: RawApproval[]; hours: RawHours[]; members: RawMember[];
}
export interface Viewer { id: string | null; role: string }

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;
export const startOfDay = (date: Date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
export const daysLate = (due: Date | null, today: Date) => due && due.getTime() < today.getTime() ? Math.round((today.getTime() - due.getTime()) / DAY_MS) : 0;
const iso = (date: Date | null) => date ? date.toISOString().slice(0, 10) : null;

/** Normal < 80%; Atenção ≥ 80%; Excedido > 100% (mesma regra das horas por atividade da Etapa 3). */
export function hourAlert(planned: number, actual: number): HourAlert {
  if (planned <= 0) return 'NORMAL';
  if (actual > planned) return 'EXCEDIDO';
  return actual / planned >= 0.8 ? 'ATENCAO' : 'NORMAL';
}
const hoursBlock = (planned: number, actual: number) => ({ planned: round2(planned), actual: round2(actual), remaining: round2(planned - actual), percent: percent(actual, planned), alert: hourAlert(planned, actual) });

const closedPhase = <T extends { alert: HourAlert }>(status: string, block: T): T => status === 'COMPLETED' && block.alert === 'ATENCAO' ? { ...block, alert: 'NORMAL' as HourAlert } : block;
const LOCKED_PHASE = ['LOCKED', 'BLOCKED'];
// Atividades que têm alguém com a bola. BLOCKED/NOT_STARTED esperam dependência e COMPLETED/CANCELLED terminaram.
const ACTIVE_TASK = ['RELEASED', 'IN_PROGRESS', 'WAITING_EVIDENCE', 'WAITING_JGM4_VALIDATION', 'ADJUSTMENT_REQUESTED', 'VALIDATED'];
const STARTED_TASK = ['IN_PROGRESS', 'WAITING_EVIDENCE', 'WAITING_JGM4_VALIDATION', 'ADJUSTMENT_REQUESTED', 'VALIDATED', 'COMPLETED'];
const CLIENT_REQUEST = ['REQUESTED', 'CLIENT_PREPARING', 'ADJUSTMENT_REQUESTED'];
const JGM4_REQUEST = ['AVAILABLE', 'SENT_TO_JGM4', 'JGM4_REVIEW'];
const CHANGE_TYPES = ['DUE_DATE_CHANGE', 'RESPONSIBLE_CHANGE', 'TASK_REOPEN', 'REQUEST_CANCEL', 'OTHER'];
const TASK_NEXT: Record<string, string> = {
  RELEASED: 'Iniciar a atividade liberada.', IN_PROGRESS: 'Executar a atividade, completar o checklist e registrar evidências.',
  WAITING_EVIDENCE: 'Anexar evidências e enviar para validação JGM4.', WAITING_JGM4_VALIDATION: 'Validar as evidências ou solicitar ajuste.',
  ADJUSTMENT_REQUESTED: 'Corrigir a atividade conforme a orientação JGM4 e reenviar.', VALIDATED: 'Concluir a atividade validada.',
};
const REQUEST_NEXT: Record<string, string> = {
  AVAILABLE: 'Enviar a solicitação ao cliente.', REQUESTED: 'Iniciar a preparação da resposta.', CLIENT_PREPARING: 'Completar os requisitos e enviar a resposta à JGM4.',
  ADJUSTMENT_REQUESTED: 'Corrigir os pontos solicitados e reenviar.', SENT_TO_JGM4: 'Iniciar a análise da resposta recebida.', JGM4_REVIEW: 'Analisar a resposta e aceitar ou solicitar ajuste.',
};

export interface ActionItem {
  key: string; kind: 'TASK' | 'REQUEST' | 'GATE' | 'CHANGE'; entityType: string; entityId: string; approvalId: string | null; code: string; title: string; status: string;
  owner: { type: Party; label: string }; ownerRole: 'JGM4' | 'JGM4_ADMIN' | 'CLIENT' | 'CLIENT_SPONSOR'; assigneeUserId: string | null;
  nextAction: string; dueDate: Date | null; daysLate: number; priority: string;
}
const PRIORITY_WEIGHT: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

function currentPhaseOf(phases: RawPhase[]) {
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  return ordered.find((phase) => phase.status !== 'COMPLETED') ?? ordered[ordered.length - 1] ?? null;
}
export function effectiveStatus(raw: RawProject) {
  const stored = raw.project.status;
  if (stored === 'COMPLETED') return 'IMPLEMENTATION_COMPLETED';
  if (['ON_HOLD', 'CANCELLED', 'IMPLEMENTATION_COMPLETED'].includes(stored)) return stored;
  const started = raw.tasks.some((task) => STARTED_TASK.includes(task.status)) || raw.hours.some((entry) => entry.hours > 0);
  return started ? 'IN_PROGRESS' : 'PLANNING';
}

export function buildProject(raw: RawProject, today: Date, viewer: Viewer) {
  const company = raw.project.company.name;
  const phases = [...raw.phases].sort((a, b) => a.order - b.order);
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const lockedPhase = (phaseId: string) => LOCKED_PHASE.includes(phaseById.get(phaseId)?.status ?? '');
  const status = effectiveStatus(raw);
  const valid = raw.tasks.filter((task) => task.status !== 'CANCELLED'); // canceladas não entram no denominador

  // ---- progresso (por atividade, nunca por tempo)
  const done = valid.filter((task) => task.status === 'COMPLETED').length;
  const progress = { percent: percent(done, valid.length), completed: done, total: valid.length, cancelled: raw.tasks.length - valid.length };

  // ---- horas (planejado = soma das atividades; realizado = soma de TimeEntry)
  const sumHours = (phaseId: string, org: 'JGM4' | 'CLIENT') => raw.hours.filter((entry) => entry.phaseId === phaseId && entry.org === org).reduce((total, entry) => total + entry.hours, 0);
  const gateByPhase = new Map(raw.gates.map((gate) => [gate.phaseId, gate]));
  const phaseRows = phases.map((phase) => {
    const own = valid.filter((task) => task.phaseId === phase.id);
    const completed = own.filter((task) => task.status === 'COMPLETED').length;
    const plannedJgm4 = own.reduce((total, task) => total + task.plannedJgm4Hours, 0) || phase.plannedJgm4Hours;
    const plannedClient = own.reduce((total, task) => total + task.plannedClientHours, 0);
    const actualJgm4 = sumHours(phase.id, 'JGM4'); const actualClient = sumHours(phase.id, 'CLIENT');
    const gate = gateByPhase.get(phase.id);
    return { id: phase.id, order: phase.order, name: phase.name, status: phase.status, percent: percent(completed, own.length), completed, total: own.length,
      // Fase concluída não exibe o alerta de 80% (já terminou); só o excesso acima de 100% continua sinalizado.
      jgm4: closedPhase(phase.status, hoursBlock(plannedJgm4, actualJgm4)), client: closedPhase(phase.status, hoursBlock(plannedClient, actualClient)),
      gate: gate ? { id: gate.id, code: gate.code, title: gate.title, status: gate.status } : null };
  });
  const sumBlock = (key: 'jgm4' | 'client') => hoursBlock(phaseRows.reduce((total, row) => total + row[key].planned, 0), phaseRows.reduce((total, row) => total + row[key].actual, 0));
  const hours = { jgm4: sumBlock('jgm4'), client: sumBlock('client') };

  // ---- itens com a bola (tarefas, solicitações, Gate atual e alterações pendentes)
  const items: ActionItem[] = [];
  const owner = (type: Party) => ({ type, label: type === 'JGM4' ? 'JGM4' : company });
  for (const task of raw.tasks) {
    if (!ACTIVE_TASK.includes(task.status) || lockedPhase(task.phaseId)) continue;
    const stored = task.currentOwnerType === 'CLIENT' || task.currentOwnerType === 'JGM4' ? task.currentOwnerType : null;
    const type: Party = stored ?? (['WAITING_JGM4_VALIDATION', 'VALIDATED'].includes(task.status) || task.responsibilityType === 'JGM4' ? 'JGM4' : 'CLIENT');
    const due = task.nextActionDueDate ?? task.plannedEndDate;
    items.push({ key: `task:${task.id}`, kind: 'TASK', entityType: 'Task', entityId: task.id, approvalId: null, code: task.code, title: task.title, status: task.status, owner: owner(type), ownerRole: type,
      assigneeUserId: type === 'JGM4' ? task.jgm4ResponsibleUserId : task.clientResponsibleUserId, nextAction: task.nextAction || TASK_NEXT[task.status], dueDate: due, daysLate: daysLate(due, today), priority: 'NORMAL' });
  }
  for (const request of raw.requests) {
    if ((!CLIENT_REQUEST.includes(request.status) && !JGM4_REQUEST.includes(request.status)) || lockedPhase(request.phaseId)) continue;
    const type: Party = CLIENT_REQUEST.includes(request.status) ? 'CLIENT' : 'JGM4';
    items.push({ key: `request:${request.id}`, kind: 'REQUEST', entityType: 'ProjectRequest', entityId: request.id, approvalId: null, code: request.code, title: request.title, status: request.status, owner: owner(type), ownerRole: type,
      assigneeUserId: type === 'CLIENT' ? request.clientResponsibleId : null, nextAction: REQUEST_NEXT[request.status], dueDate: request.dueDate, daysLate: daysLate(request.dueDate, today),
      priority: request.mandatory && request.blocking ? 'HIGH' : 'NORMAL' });
  }
  const currentPhase = currentPhaseOf(phases);
  const currentGateRaw = currentPhase ? gateByPhase.get(currentPhase.id) ?? null : null;
  if (currentGateRaw && ['AVAILABLE', 'UNDER_REVIEW', 'CORRECTION_REQUIRED', 'TECHNICALLY_APPROVED'].includes(currentGateRaw.status)) {
    const sponsor = currentGateRaw.status === 'TECHNICALLY_APPROVED'; const client = sponsor || currentGateRaw.status === 'CORRECTION_REQUIRED';
    items.push({ key: `gate:${currentGateRaw.id}`, kind: 'GATE', entityType: 'Gate', entityId: currentGateRaw.id, approvalId: null, code: currentGateRaw.code, title: currentGateRaw.title, status: currentGateRaw.status,
      owner: owner(client ? 'CLIENT' : 'JGM4'), ownerRole: sponsor ? 'CLIENT_SPONSOR' : client ? 'CLIENT' : 'JGM4', assigneeUserId: null,
      nextAction: currentGateRaw.nextAction || 'Avaliar os critérios e emitir o parecer técnico.', dueDate: currentGateRaw.nextActionDueDate, daysLate: daysLate(currentGateRaw.nextActionDueDate, today), priority: 'HIGH' });
  }
  // Aprovações de entidade (solicitação/atividade/Gate) já aparecem pela própria entidade; só as alterações entram à parte.
  for (const approval of raw.approvals.filter((item) => CHANGE_TYPES.includes(item.type))) {
    items.push({ key: `approval:${approval.id}`, kind: 'CHANGE', entityType: approval.entityType, entityId: approval.entityId, approvalId: approval.id, code: approval.entityCode ?? '—', title: approval.title, status: 'PENDING',
      owner: owner(approval.assignedRole?.startsWith('CLIENT') ? 'CLIENT' : 'JGM4'), ownerRole: approval.assignedRole?.startsWith('CLIENT') ? 'CLIENT_SPONSOR' : 'JGM4_ADMIN', assigneeUserId: null,
      nextAction: 'Decidir sobre a alteração solicitada.', dueDate: approval.dueAt, daysLate: daysLate(approval.dueAt, today), priority: approval.priority });
  }
  const ordered = [...items].sort((a, b) => b.daysLate - a.daysLate || PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
    || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || a.code.localeCompare(b.code));
  const overdueItems = ordered.filter((item) => item.daysLate > 0);

  // ---- minha fila: itens cujo responsável pela próxima ação é o meu perfil (e, se houver, o meu usuário)
  const partyRoles: Record<string, string[]> = { JGM4_ADMIN: ['JGM4', 'JGM4_ADMIN'], JGM4_CONSULTANT: ['JGM4'], CLIENT_SPONSOR: ['CLIENT', 'CLIENT_SPONSOR'], CLIENT_MANAGER: ['CLIENT'], CLIENT_USER: ['CLIENT'] };
  const mine = ordered.filter((item) => (partyRoles[viewer.role] ?? []).includes(item.ownerRole) && (viewer.role === 'JGM4_ADMIN' || !item.assigneeUserId || !viewer.id || item.assigneeUserId === viewer.id));

  // ---- Gate atual (critérios automáticos recalculados na leitura para não depender de dado desatualizado)
  let gate = null as null | { id: string; code: string; title: string; status: string; phaseOrder: number; satisfied: number; total: number; percent: number; owner: string; nextAction: string };
  if (currentGateRaw && currentPhase) {
    const phaseTasks = valid.filter((task) => task.phaseId === currentPhase.id);
    const tasksDone = phaseTasks.length > 0 && phaseTasks.every((task) => task.status === 'COMPLETED');
    const requestsDone = raw.requests.filter((request) => request.phaseId === currentPhase.id && request.mandatory && request.blocking).every((request) => request.status === 'ACCEPTED');
    const satisfied = currentGateRaw.criteria.filter((criterion) => criterion.sourceType === 'TASK' ? tasksDone : criterion.sourceType === 'REQUEST' ? requestsDone : criterion.satisfied).length;
    const ownerLabel = currentGateRaw.currentOwnerType === 'JGM4' ? 'JGM4' : currentGateRaw.currentOwnerType.startsWith('CLIENT') ? company : 'Sistema';
    gate = { id: currentGateRaw.id, code: currentGateRaw.code, title: currentGateRaw.title, status: currentGateRaw.status, phaseOrder: currentPhase.order, satisfied, total: currentGateRaw.criteria.length,
      percent: percent(satisfied, currentGateRaw.criteria.length), owner: ownerLabel,
      nextAction: currentGateRaw.nextAction || (currentGateRaw.status === 'BLOCKED' ? 'Concluir as atividades e solicitações bloqueantes da fase.' : 'Avaliar os critérios e emitir o parecer técnico.') };
  }

  // ---- contagens
  const count = (list: { status: string }[], statuses: string[]) => list.filter((item) => statuses.includes(item.status)).length;
  const tasks = { total: raw.tasks.length, notStarted: count(raw.tasks, ['NOT_STARTED']), released: count(raw.tasks, ['RELEASED']), inProgress: count(raw.tasks, ['IN_PROGRESS']),
    waitingEvidence: count(raw.tasks, ['WAITING_EVIDENCE']), waitingJgm4: count(raw.tasks, ['WAITING_JGM4_VALIDATION']), adjustment: count(raw.tasks, ['ADJUSTMENT_REQUESTED']),
    validated: count(raw.tasks, ['VALIDATED']), completed: count(raw.tasks, ['COMPLETED']), blocked: count(raw.tasks, ['BLOCKED']), cancelled: count(raw.tasks, ['CANCELLED']),
    overdue: overdueItems.filter((item) => item.kind === 'TASK').length };
  const requests = { total: raw.requests.length, planned: count(raw.requests, ['PLANNED']), blocked: count(raw.requests, ['BLOCKED']), available: count(raw.requests, ['AVAILABLE']),
    waitingClient: count(raw.requests, ['REQUESTED', 'CLIENT_PREPARING']), waitingJgm4: count(raw.requests, ['SENT_TO_JGM4', 'JGM4_REVIEW']), adjustment: count(raw.requests, ['ADJUSTMENT_REQUESTED']),
    accepted: count(raw.requests, ['ACCEPTED']), cancelled: count(raw.requests, ['CANCELLED']), overdue: overdueItems.filter((item) => item.kind === 'REQUEST').length };

  // ---- prazo
  const started = raw.tasks.map((task) => task.actualStartDate).filter((date): date is Date => !!date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const startDate = raw.project.plannedStartDate ?? (started ? startOfDay(started) : null);
  const plannedWeeks = phases.reduce((total, phase) => total + phase.plannedWeeks, 0);
  const elapsedWeeks = startDate && startDate.getTime() <= today.getTime() ? Math.floor((today.getTime() - startDate.getTime()) / (7 * DAY_MS)) : 0;
  // Previsão simples: a data mais recente entre o término do projeto e as datas das atividades (já refletem prazos aprovados).
  const dates = [raw.project.plannedEndDate, ...raw.tasks.filter((task) => task.status !== 'CANCELLED').map((task) => task.plannedEndDate)].filter((date): date is Date => !!date);
  const forecastEnd = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
  const schedule = { plannedWeeks, elapsedWeeks: Math.min(elapsedWeeks, plannedWeeks), remainingWeeks: Math.max(0, plannedWeeks - elapsedWeeks), started: !!startDate, startDate: iso(startDate), forecastEnd: iso(forecastEnd) };

  const health = buildHealth(status, phaseRows, hours.jgm4, overdueItems.length, raw.gates, phases);

  const approvalsOpen = raw.approvals;
  const nextActions = ordered.slice(0, 10);
  const criticalPending = ordered.filter((item) => ['HIGH', 'CRITICAL'].includes(item.priority));
  const byRole = (role: string) => raw.members.filter((member) => member.role === role).map((member) => member.name);
  return {
    project: { id: raw.project.id, name: raw.project.name, description: raw.project.description, status, company: raw.project.company,
      consultants: byRole('JGM4_CONSULTANT'), clientManagers: byRole('CLIENT_MANAGER'), sponsors: raw.project.sponsorName ? [raw.project.sponsorName] : byRole('CLIENT_SPONSOR') },
    currentPhase: currentPhase ? { id: currentPhase.id, order: currentPhase.order, name: currentPhase.name, status: currentPhase.status } : null,
    progress, phases: phaseRows, hours, tasks, requests, gate, schedule, health,
    pending: { count: ordered.length },
    approvals: { pending: approvalsOpen.length, high: approvalsOpen.filter((item) => ['HIGH', 'CRITICAL'].includes(item.priority)).length,
      items: [...approvalsOpen].sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.requestedAt.getTime() - b.requestedAt.getTime()).slice(0, 5)
        .map((item) => ({ id: item.id, type: item.type, code: item.entityCode, title: item.title, priority: item.priority })) },
    delays: { count: overdueItems.length, items: overdueItems.map(present) },
    nextActions: nextActions.map(present), criticalPending: criticalPending.map(present),
    myQueue: { count: mine.length, items: mine.slice(0, 10).map(present) },
    topAction: ordered[0] ? present(ordered[0]) : null,
  };
}

function present(item: ActionItem) {
  return { kind: item.kind, entityType: item.entityType, entityId: item.entityId, approvalId: item.approvalId, code: item.code, title: item.title, status: item.status, owner: item.owner,
    nextAction: item.nextAction, dueDate: iso(item.dueDate), daysLate: item.daysLate, priority: item.priority };
}

type PhaseRow = { order: number; status: string; jgm4: { planned: number; actual: number; percent: number; alert: HourAlert } };
/**
 * Saúde determinística (sem IA). CRÍTICO: projeto em espera, horas JGM4 > 100% (projeto ou fase), 3+ itens atrasados, Gate rejeitado.
 * ATENÇÃO: horas JGM4 ≥ 80% (projeto ou fase em andamento), 1–2 itens atrasados, Gate com correção solicitada. Sempre devolve os motivos.
 */
export function buildHealth(status: string, phases: PhaseRow[], jgm4Total: { planned: number; actual: number; percent: number; alert: HourAlert }, overdue: number,
  gates: { phaseId: string; code: string; status: string }[], rawPhases: { id: string; order: number }[]) {
  if (status === 'IMPLEMENTATION_COMPLETED') return { level: 'NORMAL' as HealthLevel, reasons: ['Implantação concluída.'] };
  if (status === 'CANCELLED') return { level: 'NORMAL' as HealthLevel, reasons: ['Projeto cancelado.'] };
  const critical: string[] = []; const attention: string[] = [];
  if (status === 'ON_HOLD') critical.push('Projeto em espera.');
  if (jgm4Total.alert === 'EXCEDIDO') critical.push(`Horas JGM4 do projeto excederam o planejado (${jgm4Total.actual} h de ${jgm4Total.planned} h).`);
  else if (jgm4Total.alert === 'ATENCAO') attention.push(`${jgm4Total.percent}% das horas JGM4 do projeto consumidas (${jgm4Total.actual} h de ${jgm4Total.planned} h).`);
  for (const phase of phases) {
    if (phase.jgm4.alert === 'EXCEDIDO') critical.push(`Fase ${phase.order} excedeu as horas JGM4 (${phase.jgm4.actual} h de ${phase.jgm4.planned} h).`);
    else if (phase.jgm4.alert === 'ATENCAO' && phase.status !== 'COMPLETED') attention.push(`Fase ${phase.order}: ${phase.jgm4.percent}% das horas JGM4 consumidas (${phase.jgm4.actual} h de ${phase.jgm4.planned} h).`);
  }
  const overdueText = `${overdue} ${overdue === 1 ? 'item atrasado' : 'itens atrasados'}.`;
  if (overdue >= 3) critical.push(overdueText); else if (overdue > 0) attention.push(overdueText);
  const orderOf = (phaseId: string) => rawPhases.find((phase) => phase.id === phaseId)?.order;
  for (const gate of gates) {
    if (gate.status === 'REJECTED') critical.push(`Gate ${orderOf(gate.phaseId) ?? gate.code} rejeitado.`);
    else if (gate.status === 'CORRECTION_REQUIRED') attention.push(`Gate ${orderOf(gate.phaseId) ?? gate.code} em correção.`);
  }
  return { level: (critical.length ? 'CRITICO' : attention.length ? 'ATENCAO' : 'NORMAL') as HealthLevel, reasons: [...critical, ...attention] };
}

// ---------------------------------------------------------------- movimentações recentes (AuditLog)
const TASK_VERBS: Record<string, string> = { START: 'iniciada', SEND_VALIDATION: 'enviada para validação', SUBMIT_EVIDENCE: 'teve evidências enviadas', VALIDATE: 'validada', REQUEST_ADJUSTMENT: 'teve ajuste solicitado',
  RESUME: 'retomada', COMPLETE: 'concluída', RELEASED: 'liberada', REOPENED: 'reaberta', DUE_DATE_CHANGED: 'teve o prazo alterado', RESPONSIBLE_CHANGED: 'teve o responsável alterado' };
const REQUEST_STATUS_VERBS: Record<string, string> = { REQUESTED: 'solicitada ao cliente', CLIENT_PREPARING: 'em preparação', SENT_TO_JGM4: 'enviada à JGM4', JGM4_REVIEW: 'em análise pela JGM4' };
const REQUEST_VERBS: Record<string, string> = { ACCEPTED: 'aceita', ADJUSTMENT_REQUESTED: 'teve ajuste solicitado', CANCELLED: 'cancelada' };
const GATE_VERBS: Record<string, string> = { GATE_AVAILABLE: 'ficou disponível para parecer', START_REVIEW: 'entrou em análise', REQUEST_CORRECTION: 'teve correção solicitada', RESUME_REVIEW: 'teve a análise retomada', TECHNICAL_OPINION: 'recebeu parecer técnico' };
const DECISION_VERBS: Record<string, string> = { APPROVE: 'aprovado pelo patrocinador', HOLD: 'mantido em espera', REJECT: 'rejeitado' };
const PHASE_VERBS: Record<string, string> = { PHASE_STARTED: 'iniciada', PHASE_COMPLETED: 'concluída', PHASE_RELEASED: 'liberada' };
export const RECENT_ACTIONS = [...Object.keys(TASK_VERBS), 'STATUS_CHANGED', 'ACCEPTED', 'ADJUSTMENT_REQUESTED', 'CANCELLED', ...Object.keys(GATE_VERBS), 'CLIENT_DECISION', ...Object.keys(PHASE_VERBS), 'TIME_ENTRY_CREATED', 'EVIDENCE_ADDED'];

export interface RawLog { id: string; entityType: string; entityId: string; action: string; actorType: string; userId: string | null; createdAt: Date; newValue: unknown }
export function describeActivity(log: RawLog, codes: Map<string, string>, userNames: Map<string, string>) {
  const value = (log.newValue ?? {}) as Record<string, any>;
  const code = log.entityType === 'TimeEntry' ? value.code : codes.get(`${log.entityType}:${log.entityId}`);
  if (!code) return null;
  let text: string | null = null;
  if (log.entityType === 'Task' && TASK_VERBS[log.action]) text = `${code} ${TASK_VERBS[log.action]}`;
  else if (log.entityType === 'Task' && log.action === 'EVIDENCE_ADDED') text = `Evidência registrada em ${code}`;
  else if (log.entityType === 'ProjectRequest') {
    if (log.action === 'STATUS_CHANGED' && REQUEST_STATUS_VERBS[value.status]) text = `${code} ${REQUEST_STATUS_VERBS[value.status]}`;
    else if (REQUEST_VERBS[log.action]) text = `${code} ${REQUEST_VERBS[log.action]}`;
  } else if (log.entityType === 'Gate') {
    if (log.action === 'CLIENT_DECISION' && DECISION_VERBS[value.clientDecision]) text = `${code} ${DECISION_VERBS[value.clientDecision]}`;
    else if (GATE_VERBS[log.action]) text = `${code} ${GATE_VERBS[log.action]}`;
  } else if (log.entityType === 'Phase' && PHASE_VERBS[log.action]) text = `${code} ${PHASE_VERBS[log.action]}`;
  else if (log.entityType === 'TimeEntry') text = `Horas registradas em ${code} (${value.hours} h, ${value.organizationType === 'JGM4' ? 'JGM4' : 'cliente'})`;
  if (!text) return null;
  const actor = log.userId ? userNames.get(log.userId) ?? null : log.actorType === 'SYSTEM' ? null : roleLabel(log.actorType, 'do cliente');
  return { id: log.id, at: log.createdAt, text: actor ? `${text} por ${actor}.` : `${text}.`, entityType: log.entityType, entityId: log.entityId, code, actor };
}
