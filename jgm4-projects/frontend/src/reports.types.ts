export type ReportCell = string | number | null;
export type ReportSection =
  | { type: 'kv'; title?: string; rows: [string, string][] }
  | { type: 'paragraph'; title?: string; text: string }
  | { type: 'bullets'; title: string; items: string[]; empty?: string }
  | { type: 'table'; title: string; columns: { key: string; label: string; align?: 'left' | 'right' | 'center' }[]; rows: Record<string, ReportCell>[]; empty?: string }
  | { type: 'progress'; title: string; items: { label: string; percent: number; detail?: string }[] }
  | { type: 'callout'; variant: 'technical' | 'client' | 'warning' | 'info'; title: string; lines: string[] };
export interface ReportDoc { type: string; title: string; subtitle?: string; fileName: string; project: { id: string; name: string; company: string }; emittedAt: string; emittedBy: string; sections: ReportSection[] }

export interface ReportHistoryRow { id: string; reportType: string; format: string; fileName: string; generatedAt: string; by: string; role: string | null }
export const reportTypeLabels: Record<string, string> = { EXECUTIVE: 'Relatório Executivo', PHASE: 'Relatório da Fase', PHASE_CLOSURE: 'Encerramento da Fase', GATE: 'Relatório do Gate', FINAL: 'Relatório Final', ACTION_PLAN: 'Plano de Ação', HOURS: 'Relatório de Horas', REQUESTS: 'Histórico de Solicitações', AUDIT: 'Registro de Auditoria' };

export interface AuditItem { id: string; at: string; user: string; role: string; action: string; entityType: string; entity: string; before: string; after: string; context: string }
export interface StatusHistory { status: string; events: { id: string; from: string; to: string; reason: string; note: string | null; effectiveDate: string; expectedResumeDate: string | null; by: string; at: string }[] }
