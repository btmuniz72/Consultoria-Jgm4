// Formatação padrão pt-BR (sem dependência do Angular). Datas de calendário (sem hora) usam UTC para não "voltar um dia".

const pad = (n: number) => String(n).padStart(2, '0');
/** 25/10/2026 — para datas de calendário (campos "date" do backend). */
export function fmtDate(value: string | Date | null | undefined, empty = '—'): string {
  if (!value) return empty;
  const date = typeof value === 'string' ? new Date(value) : value; if (Number.isNaN(date.getTime())) return empty;
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}
/** 25/10/2026 14:30 — para instantes (hora local do navegador). */
export function fmtDateTime(value: string | Date | null | undefined, empty = '—'): string {
  if (!value) return empty;
  const date = typeof value === 'string' ? new Date(value) : value; if (Number.isNaN(date.getTime())) return empty;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** 36 h, 7,5 h — sem casas decimais quando inteiro. */
export function fmtHours(value: number | string | null | undefined): string {
  const n = Number(value ?? 0); if (!Number.isFinite(n)) return '0 h';
  return `${Number.isInteger(n) ? n : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`;
}
/** 78% — arredondado. */
export function fmtPercent(value: number | string | null | undefined): string {
  const n = Number(value ?? 0); return `${Number.isFinite(n) ? Math.round(n) : 0}%`;
}
export function fmtNumber(value: number | string | null | undefined): string { const n = Number(value ?? 0); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '0'; }
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean); if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
