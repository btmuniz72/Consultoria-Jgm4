import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, EMPTY, catchError, combineLatest, switchMap } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { ProjectRequest, RequestRequirement, apiError, ownerLabels, requestStatusLabels } from './request.types';

@Component({
  selector: 'app-request-detail', imports: [DatePipe, RouterLink, FormsModule, ProjectNavComponent], templateUrl: './request-detail.component.html',
})
export class RequestDetailComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  private readonly refreshes = new BehaviorSubject(0);
  projectId = ''; requestId = ''; note = '';
  readonly item = signal<ProjectRequest | null>(null); readonly loading = signal(true); readonly busy = signal(false);
  readonly error = signal(''); readonly actionError = signal(''); readonly notice = signal('');
  readonly labels = requestStatusLabels; readonly owners = ownerLabels;
  readonly actions: Record<string, string> = { request: 'Enviar à Ollem', start: 'Iniciar preparação', send: 'Enviar resposta à JGM4', 'start-review': 'Iniciar análise JGM4', 'request-adjustment': 'Solicitar ajuste', accept: 'Aceitar solicitação' };
  readonly auditLabels: Record<string, string> = { CREATED: 'Solicitação criada', STATUS_CHANGED: 'Status alterado', ACCEPTED: 'Solicitação aceita', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', REQUIREMENT_CHANGED: 'Requisito atualizado' };
  ngOnInit() {
    combineLatest([this.route.paramMap, this.refreshes]).pipe(switchMap(([params]) => {
      this.projectId = params.get('id')!; this.requestId = params.get('requestId')!;
      this.loading.set(true); this.error.set('');
      return this.http.get<ProjectRequest>(this.url()).pipe(catchError((error) => { this.error.set(apiError(error)); this.loading.set(false); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((item) => { this.item.set(item); this.loading.set(false); });
  }
  private url() { return `/api/projects/${this.projectId}/requests/${this.requestId}`; }
  refresh() { this.refreshes.next(this.refreshes.value + 1); }
  act(action: string) {
    const item = this.item(); if (!item || this.busy()) return;
    if (action === 'request-adjustment' && !this.note.trim()) { this.actionError.set('Informe o motivo do ajuste no campo de observações.'); return; }
    this.busy.set(true); this.actionError.set(''); this.notice.set('');
    this.http.post<ProjectRequest>(`${this.url()}/${action}`, { expectedVersion: item.version, note: this.note }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.note = ''; this.notice.set('Operação registrada no histórico.'); this.refresh(); },
      error: (error) => { this.busy.set(false); this.actionError.set(apiError(error)); },
    });
  }
  check(requirement: RequestRequirement, event: Event) {
    const input = event.target as HTMLInputElement; const completed = input.checked;
    const item = this.item(); if (!item || this.busy()) return;
    this.busy.set(true); this.actionError.set('');
    this.http.patch<ProjectRequest>(`${this.url()}/requirements/${requirement.id}`, { completed, expectedVersion: item.version }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.refresh(); }, error: (error) => { input.checked = requirement.completed; this.busy.set(false); this.actionError.set(apiError(error)); },
    });
  }
  historyValue(value: Record<string, unknown> | null) {
    if (!value) return '';
    return [typeof value['status'] === 'string' ? this.labels[value['status']] : '',
      typeof value['label'] === 'string' ? `${value['label']}: ${value['completed'] ? 'concluído' : 'pendente'}` : '',
      typeof value['note'] === 'string' ? value['note'] : ''].filter(Boolean).join(' · ');
  }
}
