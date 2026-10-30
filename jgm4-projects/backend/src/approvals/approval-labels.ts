import type { ApprovalType } from '../generated/prisma/client';
import type { Role } from './authority';

export const TYPE_LABELS: Record<ApprovalType, string> = {
  REQUEST_REVIEW: 'Solicitação', TASK_VALIDATION: 'Validação de atividade', GATE_TECHNICAL_OPINION: 'Parecer técnico JGM4',
  GATE_CLIENT_DECISION: 'Decisão do patrocinador', DUE_DATE_CHANGE: 'Alteração de prazo', RESPONSIBLE_CHANGE: 'Troca de responsável',
  TASK_REOPEN: 'Reabertura de atividade', REQUEST_CANCEL: 'Cancelamento de solicitação', OTHER: 'Outro',
};
export type Category = 'REQUESTS' | 'TASKS' | 'GATES' | 'CHANGES';
export const CATEGORY_TYPES: Record<Category, ApprovalType[]> = {
  REQUESTS: ['REQUEST_REVIEW', 'REQUEST_CANCEL'], TASKS: ['TASK_VALIDATION', 'TASK_REOPEN'],
  GATES: ['GATE_TECHNICAL_OPINION', 'GATE_CLIENT_DECISION'], CHANGES: ['DUE_DATE_CHANGE', 'RESPONSIBLE_CHANGE', 'OTHER'],
};
export const CATEGORY_LABELS: Record<Category, string> = { REQUESTS: 'Solicitações', TASKS: 'Atividades', GATES: 'Gates', CHANGES: 'Alterações' };
export const categoryOf = (type: ApprovalType): Category => (Object.keys(CATEGORY_TYPES) as Category[]).find((key) => CATEGORY_TYPES[key].includes(type))!;

export function roleLabel(role: Role | string | null | undefined, company: string) {
  switch (role) {
    case 'JGM4_ADMIN': return 'Administrador JGM4';
    case 'JGM4_CONSULTANT': return 'Consultor JGM4';
    case 'CLIENT_SPONSOR': return `Patrocinador ${company}`;
    case 'CLIENT_MANAGER': return `Gestor ${company}`;
    case 'CLIENT_USER': return `Operacional ${company}`;
    case 'CLIENT_EXECUTIVE': return `Diretoria ${company}`;
    default: return 'Sistema';
  }
}
export const ownerOf = (role: Role | string | null | undefined, company: string) =>
  role?.startsWith('JGM4') ? { type: 'JGM4', label: 'JGM4' } : { type: 'CLIENT', label: company };

export const defaultNextAction: Record<ApprovalType, string> = {
  REQUEST_REVIEW: 'Analisar a resposta recebida e aceitar, pedir ajuste ou rejeitar.',
  TASK_VALIDATION: 'Validar as evidências ou solicitar ajuste.',
  GATE_TECHNICAL_OPINION: 'Avaliar os critérios e emitir o parecer técnico.',
  GATE_CLIENT_DECISION: 'Confirmar ou não o avanço para a próxima fase.',
  DUE_DATE_CHANGE: 'Decidir sobre o novo prazo solicitado.', RESPONSIBLE_CHANGE: 'Decidir sobre a troca de responsável.',
  TASK_REOPEN: 'Decidir sobre a reabertura da atividade concluída.', REQUEST_CANCEL: 'Decidir sobre o cancelamento da solicitação.',
  OTHER: 'Analisar e decidir.',
};

// Rótulos e campos exigidos de cada botão, por tipo (a Central mostra "Parecer técnico" e "Decisão" de forma distinta).
export function actionLabels(type: ApprovalType) {
  if (type === 'GATE_TECHNICAL_OPINION') return { approve: 'Parecer favorável ao avanço', adjust: 'Solicitar correção', reject: 'Parecer contrário ao avanço' };
  if (type === 'GATE_CLIENT_DECISION') return { approve: 'Aprovar avanço', adjust: 'Manter em espera', reject: 'Rejeitar Gate' };
  return { approve: 'Aprovar', adjust: 'Solicitar ajuste', reject: 'Rejeitar' };
}
export const fmtDate = (value: Date | string | null | undefined) => {
  if (!value) return '—';
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
};
