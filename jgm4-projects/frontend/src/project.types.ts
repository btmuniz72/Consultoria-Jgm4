export interface ProjectListItem {
  id: string;
  companyId: string;
  name: string;
  company: { id: string; name: string };
}
export interface Gate {
  id: string;
  code: string;
  title: string;
  question: string;
  status: string;
}
export interface Phase {
  id: string;
  order: number;
  name: string;
  description: string;
  plannedWeeks: number;
  plannedJgm4Hours: number;
  status: string;
  gate: Gate | null;
}
export interface Project extends ProjectListItem {
  ollemRevision?: number; contractedJgm4Hours?: number | null;
  description: string;
  methodology: string;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  phases: Phase[];
  summary: { plannedWeeks: number; plannedJgm4Hours: number; phaseCount: number; gateCount: number };
}

export interface PhaseActivitySummary {
  id: string; projectId: string; order: number; name: string; plannedWeeks: number;
  plannedJgm4Hours: number; actualJgm4Hours: number; remainingJgm4Hours: number;
  plannedClientHours: number; actualClientHours: number; remainingClientHours: number;
  completedTasks: number; inProgressTasks: number; blockedTasks: number; taskCount: number;
}
export interface ActivityTaskListItem {
  id: string; projectId: string; phaseId: string; code: string; title: string; status: string;
  statusLabel: string; currentOwnerType: string; nextAction: string;
  blockedByRequests: boolean; blockingRequests: { code: string; title: string; status: string }[];
  actualJgm4Hours: number; plannedJgm4Hours: number; actualClientHours: number; plannedClientHours: number;
}
