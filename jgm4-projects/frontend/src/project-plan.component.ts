import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, forkJoin, of, switchMap, tap } from 'rxjs';
import { ActivityTaskListItem, PhaseActivitySummary, Project, ProjectListItem } from './project.types';
import { ProjectNavComponent } from './project-nav.component';

@Component({
  selector: 'app-project-plan',
  imports: [DatePipe, RouterLink, ProjectNavComponent],
  templateUrl: './project-plan.component.html',
})
export class ProjectPlanComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly projects = signal<ProjectListItem[]>([]);
  readonly project = signal<Project | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly activitySummary = signal<PhaseActivitySummary[]>([]);
  readonly activityTasks = signal<ActivityTaskListItem[]>([]);
  readonly gateSummary = signal<any[]>([]);
  readonly pending = signal<{ total: number; items: { id: string; code: string | null; typeLabel: string; title: string; owner: { label: string }; overdue: boolean }[] } | null>(null);

  ngOnInit() {
    this.http.get<ProjectListItem[]>('/api/projects').pipe(
      tap((projects) => this.projects.set(projects)),
      switchMap(() => this.route.paramMap),
      switchMap((params) => {
        const id = params.get('id');
        if (!id && this.projects().length) {
          void this.router.navigate(['/projects', this.projects()[0].id, 'plan'], { replaceUrl: true });
          return EMPTY;
        }
        if (!id) { this.loading.set(false); return EMPTY; }
        this.project.set(null);
        this.loading.set(true);
        this.error.set('');
        return forkJoin({
          project: this.http.get<Project>(`/api/projects/${encodeURIComponent(id)}`),
          summaries: this.http.get<PhaseActivitySummary[]>(`/api/projects/${encodeURIComponent(id)}/activity-summary/phases`),
          tasks: this.http.get<ActivityTaskListItem[]>(`/api/projects/${encodeURIComponent(id)}/tasks`),
          gates: this.http.get<any[]>(`/api/projects/${encodeURIComponent(id)}/gates`),
          pending: this.http.get<any>(`/api/projects/${encodeURIComponent(id)}/approvals/pending`).pipe(catchError(() => of(null))),
        }).pipe(
          catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (result) => { this.project.set(result.project); this.activitySummary.set(result.summaries); this.activityTasks.set(result.tasks); this.gateSummary.set(result.gates); this.pending.set(result.pending); this.loading.set(false); },
      error: (error: HttpErrorResponse) => this.showError(error),
    });
  }
  private showError(error: HttpErrorResponse) {
    this.error.set(error.status === 404 || error.status === 400
      ? 'Projeto não encontrado. Selecione um projeto disponível.'
      : 'Não foi possível carregar o projeto. Verifique se a API e o banco local estão em execução.');
    this.loading.set(false);
  }
  selectProject(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    if (id) void this.router.navigate(['/projects', id, 'plan']);
  }
  retry() { window.location.reload(); }
  statusLabel(status: string) {
    const labels: Record<string, string> = {
      PLANNED: 'Planejado', BLOCKED: 'Bloqueado', AVAILABLE: 'Disponível',
      IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído', UNDER_REVIEW: 'Em análise', RELEASED: 'Liberada',
      WAITING_EVIDENCE: 'Aguardando evidências', WAITING_JGM4_VALIDATION: 'Aguardando JGM4', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', VALIDATED: 'Validada', NOT_STARTED: 'Não iniciada',
      CORRECTION_REQUIRED: 'Correção necessária', TECHNICALLY_APPROVED: 'Aprovado tecnicamente',
      APPROVED: 'Aprovado', REJECTED: 'Reprovado',
    };
    return labels[status] ?? status;
  }
  summaryFor(phaseId: string) { return this.activitySummary().find((phase) => phase.id === phaseId); }
  tasksFor(phaseId: string) { return this.activityTasks().filter((task) => task.phaseId === phaseId); }
  currentGate() { return this.gateSummary().find((gate) => gate.phase.status === 'AVAILABLE' || gate.phase.status === 'IN_PROGRESS' || gate.phase.status === 'WAITING_GATE') ?? this.gateSummary().find((gate) => !['APPROVED', 'CLOSED'].includes(gate.status)); }
  gateCriteriaDone(gate: any) { return gate.criteria.filter((criterion: any) => criterion.satisfied).length; }
}
