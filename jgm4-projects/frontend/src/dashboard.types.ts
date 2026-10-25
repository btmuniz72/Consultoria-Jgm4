import { alertLabels as alerts, gateStatusLabels as gates, healthLabels as health, kindLabels as kinds, phaseStatusLabels as phases, projectStatusLabels as projects } from './ui/labels';
export type HealthLevel = 'NORMAL' | 'ATENCAO' | 'CRITICO';
export type HourAlert = 'NORMAL' | 'ATENCAO' | 'EXCEDIDO';
export interface HoursBlock { planned: number; actual: number; remaining: number; percent: number; alert: HourAlert }
export interface ActionRow { kind: string; entityType: string; entityId: string; approvalId: string | null; code: string; title: string; status: string; owner: { type: string; label: string }; nextAction: string; dueDate: string | null; daysLate: number; priority: string }
export interface Health { level: HealthLevel; reasons: string[] }
export interface GateSummary { id: string; code: string; title: string; status: string; phaseOrder: number; satisfied: number; total: number; percent: number; owner: string; nextAction: string }

export interface ProjectDashboard {
  externalDependencies?: { id: string; description: string; responsible: string; dueDate: string | null; status: string; blocksProject: boolean; blocksTask: boolean; taskId: string | null }[];
  project: { id: string; name: string; description: string; status: string; company: { id: string; name: string }; consultants: string[]; clientManagers: string[]; sponsors: string[] };
  currentPhase: { id: string; order: number; name: string; status: string } | null;
  progress: { percent: number; completed: number; total: number; cancelled: number };
  phases: { id: string; order: number; name: string; status: string; percent: number; completed: number; total: number; jgm4: HoursBlock; client: HoursBlock; gate: { id: string; code: string; title: string; status: string } | null }[];
  hours: { jgm4: HoursBlock; client: HoursBlock };
  tasks: Record<string, number>; requests: Record<string, number>;
  gate: GateSummary | null;
  schedule: { plannedWeeks: number; elapsedWeeks: number; remainingWeeks: number; started: boolean; startDate: string | null; forecastEnd: string | null };
  health: Health; pending: { count: number };
  approvals: { pending: number; high: number; items: { id: string; type: string; code: string | null; title: string; priority: string }[] };
  delays: { count: number; items: ActionRow[] };
  nextActions: ActionRow[]; criticalPending: ActionRow[]; myQueue: { count: number; items: ActionRow[] }; topAction: ActionRow | null;
  recentActivity: { id: string; at: string; text: string; entityType: string; entityId: string; code: string }[];
}

export interface DashboardOverview {
  role: string;
  cards: { activeProjects: number; attention: number; critical: number; approvalsPending: number; jgm4Hours: number; clientHours: number; overdue: number };
  projects: { id: string; name: string; company: { id: string; name: string }; status: string; currentPhase: { order: number; name: string } | null; progress: number; health: Health;
    gate: { id: string; code: string; title: string; status: string; percent: number } | null; nextAction: ActionRow | null; forecastEnd: string | null; consultants: string[];
    overdue: number; approvalsPending: number; jgm4Hours: HoursBlock; myQueue: number }[];
}


export function itemLink(projectId: string, item: Pick<ActionRow, 'kind' | 'entityId' | 'approvalId'>): unknown[] {
  if (item.kind === 'CHANGE' && item.approvalId) return ['/approvals', item.approvalId];
  if (item.kind === 'TASK') return ['/projects', projectId, 'tasks', item.entityId];
  if (item.kind === 'REQUEST') return ['/projects', projectId, 'requests', item.entityId];
  return ['/projects', projectId, 'gates', item.entityId];
}
export function whenLabel(value: string) {
  const at = new Date(value); const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 86400000);
  return sameDay(at, now) ? `Hoje ${time}` : sameDay(at, yesterday) ? `Ontem ${time}` : `${at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

export const projectStatusLabels: Record<string, string> = projects;
export const healthLabels = health as Record<HealthLevel, string>;
export const alertLabels = alerts as Record<HourAlert, string>;
export const phaseTimelineLabels: Record<string, string> = phases;
export const gateStatusLabels: Record<string, string> = gates;
export const kindLabels: Record<string, string> = kinds;
