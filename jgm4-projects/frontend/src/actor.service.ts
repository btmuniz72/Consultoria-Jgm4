import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';

// Perfil simulado (sem login nesta fase). Vazio = usa o perfil padrão do ambiente (JGM4_LOCAL_ACTOR).
export const ACTOR_ROLES = [
  { id: '', label: 'Padrão do ambiente' },
  { id: 'JGM4_ADMIN', label: 'JGM4 · Administrador' },
  { id: 'JGM4_CONSULTANT', label: 'JGM4 · Consultor' },
  { id: 'CLIENT_SPONSOR', label: 'Cliente · Patrocinador' },
  { id: 'CLIENT_MANAGER', label: 'Cliente · Gestor' },
  { id: 'CLIENT_USER', label: 'Cliente · Usuário' },
];
const KEY = 'jgm4.actorRole';
export function storedRole() { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } }

// Lê direto do armazenamento (e não do serviço) para não criar dependência circular com o HttpClient.
export const actorInterceptor: HttpInterceptorFn = (request, next) => {
  const role = storedRole();
  return next(role ? request.clone({ setHeaders: { 'x-actor-role': role } }) : request);
};

export interface ApprovalSummary { role: string; total: number; requests: number; tasks: number; gates: number; changes: number; overdue: number; high: number }

@Injectable({ providedIn: 'root' })
export class ActorService {
  private readonly http = inject(HttpClient);
  readonly role = signal(storedRole());
  readonly summary = signal<ApprovalSummary | null>(null);
  setRole(role: string) {
    try { if (role) localStorage.setItem(KEY, role); else localStorage.removeItem(KEY); } catch { /* armazenamento indisponível */ }
    // Recarrega para que todas as telas passem a usar o novo perfil.
    window.location.reload();
  }
  refresh() {
    this.http.get<ApprovalSummary>('/api/approvals/summary').subscribe({ next: (summary) => this.summary.set(summary), error: () => this.summary.set(null) });
  }
}
