export interface RequestRequirement {
  id: string; label: string; description: string | null; required: boolean;
  completed: boolean; completedAt: string | null;
}
export interface ProjectRequest {
  id: string; projectId: string; code: string; title: string; description: string; instructions: string;
  status: string; mandatory: boolean; blocking: boolean; acceptanceCriteria: string;
  estimatedClientHours: number | null; dueDate: string | null; version: number;
  phase: { id: string; order: number; name: string };
  task: { id: string; code: string; title: string; status: string } | null;
  clientResponsible: { id: string; name: string } | null;
  currentOwnerType: string; nextAction: string; blockedReason: string | null;
  previousGate: { code: string; title: string; status: string } | null;
  requirements: RequestRequirement[]; missingRequirements: RequestRequirement[];
  allowedActions: string[]; canEditRequirements: boolean; canSend: boolean;
  history?: { id: string; action: string; actorType: string; createdAt: string; oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null }[];
}
export { requestStatusLabels } from './ui/labels';
export const ownerLabels: Record<string, string> = { JGM4: 'JGM4', CLIENT: 'Ollem', SYSTEM: 'Sistema', NONE: 'Sem ação pendente' };
export function apiError(error: { error?: { message?: string | string[] }; status?: number }) {
  const message = error.error?.message;
  return Array.isArray(message) ? message.join(' ') : message || 'Não foi possível concluir a operação. Verifique a conexão e tente novamente.';
}
