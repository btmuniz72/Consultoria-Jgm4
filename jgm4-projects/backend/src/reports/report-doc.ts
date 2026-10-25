// Modelo único de documento (Etapa 7): os serviços montam seções determinísticas a partir dos dados registrados;
// a mesma estrutura alimenta a visualização no navegador e o PDF gerado no backend. Nada é gerado por IA.
export type Cell = string | number | null;
export type Section =
  | { type: 'kv'; title?: string; rows: [string, string][] }
  | { type: 'paragraph'; title?: string; text: string }
  | { type: 'bullets'; title: string; items: string[]; empty?: string }
  | { type: 'table'; title: string; columns: { key: string; label: string; weight?: number; align?: 'left' | 'right' | 'center' }[]; rows: Record<string, Cell>[]; empty?: string }
  | { type: 'progress'; title: string; items: { label: string; percent: number; detail?: string }[] }
  | { type: 'callout'; variant: 'technical' | 'client' | 'warning' | 'info'; title: string; lines: string[] };

export interface ReportDoc {
  type: string; title: string; subtitle?: string; fileName: string;
  project: { id: string; name: string; company: string; methodology: string };
  emittedAt: string; emittedBy: string; sections: Section[];
}

export const fmtDate = (value: Date | string | null | undefined) => {
  if (!value) return '—';
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
};
export const fmtDateTime = (value: Date | string | null | undefined) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
};
export const hoursText = (value: number) => `${Math.round(value * 100) / 100} h`;

export const statusLabels = {
  project: { PLANNING: 'Planejamento', PLANNED: 'Planejamento', IN_PROGRESS: 'Em andamento', ON_HOLD: 'Suspenso (em espera)', IMPLEMENTATION_COMPLETED: 'Implantação concluída', COMPLETED: 'Implantação concluída', CANCELLED: 'Cancelado' } as Record<string, string>,
  phase: { BLOCKED: 'Bloqueada', LOCKED: 'Bloqueada', AVAILABLE: 'Disponível', IN_PROGRESS: 'Em execução', WAITING_GATE: 'Aguardando Gate', COMPLETED: 'Concluída' } as Record<string, string>,
  gate: { BLOCKED: 'Bloqueado', AVAILABLE: 'Disponível para parecer', UNDER_REVIEW: 'Em análise', CORRECTION_REQUIRED: 'Correção necessária', TECHNICALLY_APPROVED: 'Aguardando decisão do cliente', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', CLOSED: 'Encerrado' } as Record<string, string>,
  task: { NOT_STARTED: 'Não iniciada', BLOCKED: 'Bloqueada', RELEASED: 'Liberada', IN_PROGRESS: 'Em andamento', WAITING_EVIDENCE: 'Aguardando evidências', WAITING_JGM4_VALIDATION: 'Aguardando validação JGM4', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', VALIDATED: 'Validada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' } as Record<string, string>,
  request: { PLANNED: 'Planejada', BLOCKED: 'Bloqueada', AVAILABLE: 'Disponível', REQUESTED: 'Solicitada ao cliente', CLIENT_PREPARING: 'Em preparação', SENT_TO_JGM4: 'Enviada à JGM4', JGM4_REVIEW: 'Em análise JGM4', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', ACCEPTED: 'Aceita', CANCELLED: 'Cancelada' } as Record<string, string>,
  health: { NORMAL: 'Normal', ATENCAO: 'Atenção', CRITICO: 'Crítico' } as Record<string, string>,
  priority: { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', CRITICAL: 'Crítica' } as Record<string, string>,
  recommendation: { ADVANCE: 'Recomenda o avanço', DO_NOT_ADVANCE: 'Não recomenda o avanço' } as Record<string, string>,
  decision: { APPROVE: 'Aprovado — avanço autorizado', HOLD: 'Mantido em espera', REJECT: 'Rejeitado' } as Record<string, string>,
  source: { TASK: 'Atividades', REQUEST: 'Solicitações', MANUAL: 'Avaliação técnica', INDICATOR: 'Indicador', DOCUMENT: 'Documento' } as Record<string, string>,
};
export const label = (map: Record<string, string>, key: string | null | undefined) => (key ? map[key] ?? key : '—');

const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const methodologyName = (methodology: string) => methodology.split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join('_');
/** `Ollem_Plano_C_Relatorio_Executivo_2026-11-15.pdf` — empresa (1ª palavra), metodologia e documento. */
export function reportFileName(project: { company: string; methodology: string }, document: string, ext: 'pdf' | 'xlsx', date?: string) {
  const parts = [slug(project.company.split(' ')[0]), slug(methodologyName(project.methodology)), slug(document)];
  if (date) parts.push(date);
  return `${parts.filter(Boolean).join('_')}.${ext}`;
}
