import type { TaskStatus } from '../generated/prisma/client';

/**
 * Percentual de evolução CALCULADO (nunca gravado), para não divergir do estado real.
 * Regra por estágio do fluxo da atividade; em andamento, proporcional ao checklist obrigatório (até 60%).
 *   não iniciada / bloqueada / liberada → 0   |  em andamento → 0..60 (checklist)  |  aguardando evidência / ajuste → 60
 *   aguardando validação JGM4 → 80          |  validada → 95                      |  concluída → 100
 * Atividade cancelada não entra na conta (null).
 */
export interface ProgressInput { status: TaskStatus | string; requirements?: ReadonlyArray<{ required: boolean; completed: boolean }> }

export function taskProgress(task: ProgressInput): number | null {
  switch (task.status) {
    case 'CANCELLED': return null;
    case 'COMPLETED': return 100;
    case 'VALIDATED': return 95;
    case 'WAITING_JGM4_VALIDATION': return 80;
    case 'WAITING_EVIDENCE': case 'ADJUSTMENT_REQUESTED': return 60;
    case 'IN_PROGRESS': {
      const required = (task.requirements ?? []).filter((item) => item.required);
      return required.length ? Math.round((required.filter((item) => item.completed).length / required.length) * 60) : 0;
    }
    default: return 0;
  }
}

/** Média das atividades que contam (exclui canceladas); lista vazia → 0. */
export function averageProgress(tasks: ReadonlyArray<ProgressInput>): number {
  const values = tasks.map(taskProgress).filter((value): value is number => value !== null);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}
