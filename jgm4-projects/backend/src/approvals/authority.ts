import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
import type { ApprovalType, UserRole } from '../generated/prisma/client';

// Alçadas por role (Etapa 5). A estrutura é uma lista de regras permissão → roles, para que a
// expansão futura (por projeto, por usuário vinculado, por valor) troque apenas a avaliação em `can`.
export const ROLES = ['JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER', 'CLIENT_USER'] as const satisfies readonly UserRole[];
export type Role = typeof ROLES[number];

export type Permission =
  | 'REQUEST_VALIDATE' | 'TASK_VALIDATE' | 'GATE_TECHNICAL_OPINION' | 'ADJUSTMENT_REQUEST'
  | 'DUE_DATE_APPROVE' | 'RESPONSIBLE_APPROVE' | 'TASK_REOPEN_APPROVE' | 'REQUEST_CANCEL_APPROVE' | 'CONFLICT_RESOLVE'
  | 'GATE_CLIENT_DECISION' | 'CLIENT_CRITICAL_APPROVE'
  | 'TASK_EXECUTE' | 'REQUEST_RESPOND' | 'DUE_DATE_REQUEST' | 'RESPONSIBLE_REQUEST' | 'TASK_REOPEN_REQUEST' | 'REQUEST_CANCEL_REQUEST'
  | 'PHASE_STRUCTURE_EDIT' | 'CLOSED_ITEM_REOPEN' | 'CLOSED_GATE_EDIT' | 'GLOBAL_RULES_EDIT';

export interface AuthorityRule { permission: Permission; roles: readonly Role[]; description: string }
const jgm4 = ['JGM4_ADMIN', 'JGM4_CONSULTANT'] as const;
const requesters = ['JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER'] as const;

export const AUTHORITY_RULES: readonly AuthorityRule[] = [
  { permission: 'REQUEST_VALIDATE', roles: jgm4, description: 'Validar (aceitar) respostas de solicitações' },
  { permission: 'TASK_VALIDATE', roles: jgm4, description: 'Validar atividades enviadas' },
  { permission: 'GATE_TECHNICAL_OPINION', roles: jgm4, description: 'Emitir parecer técnico de Gate (consultor: quando vinculado ao projeto)' },
  { permission: 'ADJUSTMENT_REQUEST', roles: jgm4, description: 'Solicitar ajustes' },
  { permission: 'DUE_DATE_APPROVE', roles: ['JGM4_ADMIN'], description: 'Aprovar alteração de prazo' },
  { permission: 'RESPONSIBLE_APPROVE', roles: ['JGM4_ADMIN'], description: 'Aprovar alteração de responsável' },
  { permission: 'TASK_REOPEN_APPROVE', roles: ['JGM4_ADMIN'], description: 'Reabrir atividade concluída' },
  { permission: 'REQUEST_CANCEL_APPROVE', roles: ['JGM4_ADMIN'], description: 'Cancelar solicitação' },
  { permission: 'CONFLICT_RESOLVE', roles: ['JGM4_ADMIN'], description: 'Resolver conflitos e aprovações de tipo OTHER' },
  { permission: 'GATE_CLIENT_DECISION', roles: ['CLIENT_SPONSOR'], description: 'Decidir o avanço do Gate (patrocinador)' },
  { permission: 'CLIENT_CRITICAL_APPROVE', roles: ['CLIENT_SPONSOR'], description: 'Aprovar mudanças críticas do lado cliente' },
  { permission: 'TASK_EXECUTE', roles: ['CLIENT_MANAGER', 'CLIENT_SPONSOR'], description: 'Executar atividades' },
  { permission: 'REQUEST_RESPOND', roles: ['CLIENT_MANAGER', 'CLIENT_SPONSOR'], description: 'Responder solicitações' },
  { permission: 'DUE_DATE_REQUEST', roles: requesters, description: 'Pedir alteração de prazo' },
  { permission: 'RESPONSIBLE_REQUEST', roles: requesters, description: 'Pedir troca de responsável' },
  { permission: 'TASK_REOPEN_REQUEST', roles: requesters, description: 'Pedir reabertura de atividade concluída' },
  { permission: 'REQUEST_CANCEL_REQUEST', roles: requesters, description: 'Pedir cancelamento de solicitação' },
  { permission: 'PHASE_STRUCTURE_EDIT', roles: ['JGM4_ADMIN'], description: 'Alterar estrutura de fase (reservado)' },
  { permission: 'CLOSED_ITEM_REOPEN', roles: ['JGM4_ADMIN'], description: 'Reabrir item encerrado (reservado)' },
  { permission: 'CLOSED_GATE_EDIT', roles: ['JGM4_ADMIN'], description: 'Alterar Gate já fechado (reservado)' },
  { permission: 'GLOBAL_RULES_EDIT', roles: ['JGM4_ADMIN'], description: 'Alterar regras globais (reservado)' },
];

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);
export const can = (role: Role, permission: Permission) => AUTHORITY_RULES.some((rule) => rule.permission === permission && rule.roles.includes(role));
export const isJgm4Role = (role: Role) => role === 'JGM4_ADMIN' || role === 'JGM4_CONSULTANT';
export function assertCan(role: Role, permission: Permission, message?: string) {
  if (!can(role, permission)) throw new ForbiddenException(message ?? `O perfil ${role} não tem alçada para esta ação (${permission}).`);
}

// Permissão exigida para decidir cada tipo de aprovação.
export const DECISION_PERMISSION: Record<ApprovalType, Permission> = {
  REQUEST_REVIEW: 'REQUEST_VALIDATE', TASK_VALIDATION: 'TASK_VALIDATE', GATE_TECHNICAL_OPINION: 'GATE_TECHNICAL_OPINION',
  GATE_CLIENT_DECISION: 'GATE_CLIENT_DECISION', DUE_DATE_CHANGE: 'DUE_DATE_APPROVE', RESPONSIBLE_CHANGE: 'RESPONSIBLE_APPROVE',
  TASK_REOPEN: 'TASK_REOPEN_APPROVE', REQUEST_CANCEL: 'REQUEST_CANCEL_APPROVE', OTHER: 'CONFLICT_RESOLVE',
};

// Perfil do ator local. Sem login nesta fase: o cabeçalho `x-actor-role` escolhe o perfil simulado;
// sem ele vale JGM4_LOCAL_ACTOR (JGM4 → JGM4_ADMIN, CLIENT → CLIENT_SPONSOR), preservando as Etapas 1–4.
const storage = new AsyncLocalStorage<{ role?: Role }>();
export function actorMiddleware(req: { headers: Record<string, unknown> }, _res: unknown, next: () => void) {
  const header = req.headers['x-actor-role'];
  storage.run({ role: isRole(header) ? header : undefined }, next);
}
export function currentRole(): Role {
  return storage.getStore()?.role ?? (process.env.JGM4_LOCAL_ACTOR === 'CLIENT' ? 'CLIENT_SPONSOR' : 'JGM4_ADMIN');
}

// Quando a decisão chega pela Central, o desfecho escolhido (ex.: "rejeitar") precisa prevalecer sobre o
// desfecho padrão que o workflow original registraria — dentro da mesma transação.
export interface DecisionContext { status: 'APPROVED' | 'ADJUSTMENT_REQUESTED' | 'REJECTED'; comment?: string | null; payload?: Record<string, unknown> }
const decisions = new AsyncLocalStorage<DecisionContext>();
export const withDecision = <T>(context: DecisionContext, fn: () => Promise<T>) => decisions.run(context, fn);
export const currentDecision = () => decisions.getStore();
