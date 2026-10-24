import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, tap } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';

interface TaskDetail {
  id: string; projectId: string; phaseId: string; code: string; title: string; description: string | null;
  objective: string; instructions: string; acceptanceCriteria: string; status: string; statusLabel: string;
  responsibilityType: string; plannedStartDate: string | null; plannedEndDate: string | null;
  actualStartDate: string | null; actualEndDate: string | null; plannedJgm4Hours: number; actualJgm4Hours: number;
  remainingJgm4Hours: number; plannedClientHours: number; actualClientHours: number; remainingClientHours: number;
  jgm4ConsumptionPercent: number | null; jgm4Alert: string | null; currentOwnerType: string; nextAction: string;
  nextActionDueDate: string | null; version: number; localActor: string; phase: { name: string; order: number; plannedWeeks: number; plannedJgm4Hours: number };
  predecessor: { code: string; title: string; status: string } | null; gate: { code: string; title: string; status: string } | null;
  clientResponsible: { id: string; name: string } | null; jgm4Responsible: { id: string; name: string } | null;
  dependencies: { labels: string[]; requests: unknown[] };
  requests: { id: string; code: string; title: string; status: string }[];
  requirements: { id: string; label: string; required: boolean; completed: boolean }[];
  evidence: { id: string; description: string; referenceUrl: string | null; createdAt: string }[];
  timeEntries: { id: string; organizationType: string; date: string; hours: string; description: string }[];
  history: { id: string; action: string; actorType: string; newValue: unknown; createdAt: string }[];
  missingRequirements: unknown[]; allowedActions: string[];
}

@Component({ selector: 'app-task-detail', imports: [DatePipe, JsonPipe, FormsModule, RouterLink, ProjectNavComponent], templateUrl: './task-detail.component.html' })
export class TaskDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly task = signal<TaskDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly adjustmentOpen = signal(false);
  readonly planOpen = signal(false);
  adjustment = { comment: '', guidance: '' };
  evidenceForm = { description: '', referenceUrl: '' };
  timeForm = { date: this.today(), hours: 1, description: '' };
  planForm = { responsibilityType: 'JOINT', plannedStartDate: '', plannedEndDate: '', nextActionDueDate: '', nextAction: '', plannedJgm4Hours: 0, plannedClientHours: 0 };
  ngOnInit() {
    this.route.paramMap.pipe(switchMap((params) => {
      const projectId = params.get('id'); const taskId = params.get('taskId');
      if (!projectId || !taskId) { this.error.set('O endereço da atividade está incompleto.'); this.loading.set(false); return EMPTY; }
      this.loading.set(true); this.error.set(''); this.notice.set(''); this.task.set(null);
      return this.http.get<TaskDetail>(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`).pipe(
        tap((task) => this.syncPlan(task)), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe({ next: (task) => { this.task.set(task); this.loading.set(false); }, error: (error: HttpErrorResponse) => this.showError(error) });
  }
  private syncPlan(task: TaskDetail) {
    this.planForm = { responsibilityType: task.responsibilityType, plannedStartDate: task.plannedStartDate?.slice(0, 10) ?? '', plannedEndDate: task.plannedEndDate?.slice(0, 10) ?? '', nextActionDueDate: task.nextActionDueDate?.slice(0, 10) ?? '', nextAction: task.nextAction ?? '', plannedJgm4Hours: task.plannedJgm4Hours, plannedClientHours: task.plannedClientHours };
  }
  private today() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  private url(suffix = '') { const task = this.task(); return task ? `/api/tasks/${encodeURIComponent(task.id)}${suffix}` : ''; }
  private showError(error: HttpErrorResponse) {
    const value = error.error?.message;
    this.error.set(Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : 'Não foi possível concluir esta ação. Verifique a API local e tente novamente.');
    this.loading.set(false); this.saving.set(false);
  }
  private replaceTask(task: TaskDetail) { this.task.set(task); this.syncPlan(task); this.error.set(''); this.notice.set('Alteração registrada no histórico da atividade.'); }
  runAction(action: string) {
    const task = this.task(); if (!task) return;
    if (action === 'request-adjustment') { this.adjustmentOpen.set(true); return; }
    if (action === 'update-plan') { this.planOpen.set(!this.planOpen()); return; }
    this.saving.set(true); this.error.set('');
    this.http.post<TaskDetail>(this.url(`/${action}`), { expectedVersion: task.version }).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; })).subscribe((updated) => { this.replaceTask(updated); this.saving.set(false); });
  }
  saveAdjustment() {
    const task = this.task(); if (!task) return;
    this.saving.set(true);
    this.http.post<TaskDetail>(this.url('/request-adjustment'), { expectedVersion: task.version, comment: this.adjustment.comment, guidance: this.adjustment.guidance }).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; })).subscribe((updated) => { this.replaceTask(updated); this.adjustmentOpen.set(false); this.adjustment = { comment: '', guidance: '' }; this.saving.set(false); });
  }
  toggleRequirement(requirementId: string, event: Event) {
    const task = this.task(); const completed = (event.target as HTMLInputElement).checked; if (!task) return;
    this.saving.set(true);
    this.http.patch<TaskDetail>(this.url(`/requirements/${encodeURIComponent(requirementId)}`), { completed, expectedVersion: task.version }).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; })).subscribe((updated) => { this.replaceTask(updated); this.saving.set(false); });
  }
  addEvidence() {
    const task = this.task(); if (!task) return; this.saving.set(true);
    this.http.post<TaskDetail>(this.url('/evidence'), this.evidenceForm).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; })).subscribe((updated) => { this.replaceTask(updated); this.evidenceForm = { description: '', referenceUrl: '' }; this.saving.set(false); });
  }
  addTime() {
    const task = this.task(); if (!task) return; this.saving.set(true);
    this.http.post<{ task: TaskDetail }>(this.url('/time-entries'), this.timeForm).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; })).subscribe((result) => { this.replaceTask(result.task); this.timeForm = { date: this.today(), hours: 1, description: '' }; this.saving.set(false); });
  }
  savePlan() {
    const task = this.task(); if (!task) return; this.saving.set(true);
    const payload = { ...this.planForm, plannedStartDate: this.planForm.plannedStartDate || undefined, plannedEndDate: this.planForm.plannedEndDate || undefined, nextActionDueDate: this.planForm.nextActionDueDate || undefined, expectedVersion: task.version };
    this.http.patch<TaskDetail>(this.url('/plan'), payload).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.showError(error); return EMPTY; })).subscribe((updated) => { this.replaceTask(updated); this.planOpen.set(false); this.saving.set(false); });
  }
  reload() { window.location.reload(); }
}
