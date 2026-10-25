import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ApprovalSummary { role: string; total: number; requests: number; tasks: number; gates: number; changes: number; overdue: number; high: number }

// Contagem de pendências (badge e cards). A identidade e o perfil vêm do usuário autenticado no backend.
@Injectable({ providedIn: 'root' })
export class ActorService {
  private readonly http = inject(HttpClient);
  readonly summary = signal<ApprovalSummary | null>(null);
  refresh() {
    this.http.get<ApprovalSummary>('/api/approvals/summary').subscribe({ next: (summary) => this.summary.set(summary), error: () => this.summary.set(null) });
  }
  clear() { this.summary.set(null); }
}
