import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DialogService } from './ui/dialog.service';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { AuthService } from './auth.service';
import { ProjectDashboard, projectStatusLabels } from './dashboard.types';
import { StatusHistory } from './reports.types';

interface Sustainment { id: string; routine: string; frequency: string; responsible: string; indicator: string | null; criterion: string | null; nextReviewDate: string | null; active: boolean }
interface Carried { id: string; description: string; responsible: string; dueDate: string | null; status: string; fromPhase: { order: number }; toPhase: { order: number } }
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

@Component({
  selector: 'app-project-manage', imports: [DatePipe, FormsModule, ProjectNavComponent],
  template: `<main class="manage-page">
    <app-project-nav [projectId]="projectId" />
    <div class="page-heading"><div><p class="eyebrow">GESTÃO DO PROJETO</p><h1>Situação, sustentação e pendências</h1><p class="lead">{{ d()?.project?.name }} · exclusivo da equipe JGM4.</p></div></div>
    @if (notice()) { <p class="success-note" role="status" data-testid="manage-notice">{{ notice() }}</p> }
    @if (error()) { <p class="error-note" role="alert" data-testid="manage-error">{{ error() }}</p> }

    <section class="panel" data-testid="status-panel"><div class="section-heading"><div><p class="eyebrow">SITUAÇÃO DO PROJETO</p><h2>{{ statusLabel(status()) }}</h2></div></div>
      @if (isAdmin()) {
        <div class="action-buttons">
          @if (['PLANNING', 'PLANNED', 'IN_PROGRESS'].includes(status())) { <button type="button" class="secondary" (click)="mode.set('hold')" data-testid="open-hold">Suspender projeto</button> }
          @if (status() === 'ON_HOLD') { <button type="button" (click)="mode.set('resume')" data-testid="open-resume">Retomar projeto</button> }
          @if (!['CANCELLED', 'IMPLEMENTATION_COMPLETED', 'COMPLETED'].includes(status())) { <button type="button" class="secondary danger" (click)="mode.set('cancel')" data-testid="open-cancel">Cancelar projeto</button> }
        </div>
        @if (mode(); as m) {
          <form class="task-form inline-form" (ngSubmit)="submitStatus()">
            <h3>{{ m === 'hold' ? 'Suspender o projeto' : m === 'resume' ? 'Retomar o projeto' : 'Cancelar o projeto (irreversível: passa a ser somente consulta)' }}</h3>
            <label>Motivo (obrigatório)<textarea name="reason" rows="2" required minlength="5" [(ngModel)]="form.reason" data-testid="status-reason"></textarea></label>
            @if (m !== 'resume') { <div class="form-grid"><label>Data de efeito<input type="date" name="effectiveDate" required [(ngModel)]="form.effectiveDate"></label>
              @if (m === 'hold') { <label>Previsão de retomada (opcional)<input type="date" name="expectedResumeDate" [(ngModel)]="form.expectedResumeDate"></label> }</div>
              <label>Observação (obrigatória)<textarea name="note" rows="2" required minlength="3" [(ngModel)]="form.note"></textarea></label> }
            @if (m === 'cancel') { <label>Confirme sua senha (ação crítica)<input type="password" name="confirmPassword" required autocomplete="current-password" [(ngModel)]="form.confirmPassword" data-testid="status-password"></label> }
            <div class="action-buttons"><button type="submit" [disabled]="saving()" data-testid="status-confirm">Confirmar</button><button type="button" class="secondary" (click)="mode.set(null)">Cancelar</button></div>
          </form>
        }
      } @else { <p class="muted-copy">Somente o administrador JGM4 altera a situação do projeto.</p> }
      <h3>Histórico de situação</h3>
      <ol class="history-list">@for (event of history().events; track event.id) { <li><div><strong>{{ label(event.from) }} → {{ label(event.to) }}</strong><span>{{ event.effectiveDate | date:'dd/MM/yyyy':'UTC' }} · {{ event.by }}</span></div><small>{{ event.reason }}@if (event.note) { — {{ event.note }} }@if (event.expectedResumeDate) { · retomada prevista {{ event.expectedResumeDate | date:'dd/MM/yyyy':'UTC' }} }</small></li> } @empty { <li class="muted-copy">Nenhuma mudança de situação registrada.</li> }</ol>
    </section>

    <section class="panel" data-testid="sustainment-panel"><div class="section-heading"><div><p class="eyebrow">PLANO DE SUSTENTAÇÃO</p><h2>Rotinas de sustentação</h2></div></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Rotina</th><th>Frequência</th><th>Responsável</th><th>Indicador</th><th>Critério</th><th>Próxima revisão</th><th></th></tr></thead><tbody>
        @for (item of sustainment(); track item.id) { <tr [class.inactive]="!item.active"><td data-label="Rotina">{{ item.routine }}</td><td data-label="Frequência">{{ item.frequency }}</td><td data-label="Responsável">{{ item.responsible }}</td><td data-label="Indicador">{{ item.indicator || '—' }}</td><td data-label="Critério">{{ item.criterion || '—' }}</td>
          <td data-label="Próxima revisão">{{ item.nextReviewDate ? (item.nextReviewDate | date:'dd/MM/yyyy':'UTC') : '—' }}</td><td>@if (item.active) { <button type="button" class="quiet-button" (click)="deactivate(item)">Desativar</button> } @else { <small>Inativo</small> }</td></tr>
        } @empty { <tr><td colspan="7" class="empty-row">Nenhum item cadastrado.</td></tr> }</tbody></table></div>
      <form class="task-form inline-form" (ngSubmit)="addSustainment()"><h3>Novo item</h3>
        <div class="form-grid"><label>Rotina<input name="routine" required minlength="2" [(ngModel)]="sForm.routine" data-testid="s-routine"></label><label>Frequência<input name="frequency" required [(ngModel)]="sForm.frequency" data-testid="s-frequency"></label>
          <label>Responsável<input name="responsible" required [(ngModel)]="sForm.responsible" data-testid="s-responsible"></label><label>Indicador<input name="indicator" [(ngModel)]="sForm.indicator"></label>
          <label>Critério<input name="criterion" [(ngModel)]="sForm.criterion"></label><label>Próxima revisão<input type="date" name="nextReviewDate" [(ngModel)]="sForm.nextReviewDate"></label></div>
        <button type="submit" [disabled]="saving()" data-testid="s-add">Adicionar item</button></form>
    </section>

    <section class="panel" data-testid="carried-panel"><div class="section-heading"><div><p class="eyebrow">ENCERRAMENTO DE FASE</p><h2>Pendências transferidas</h2></div></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Origem → destino</th><th>Situação</th><th></th></tr></thead><tbody>
        @for (item of carried(); track item.id) { <tr><td data-label="Descrição">{{ item.description }}</td><td data-label="Responsável">{{ item.responsible }}</td><td data-label="Prazo">{{ item.dueDate ? (item.dueDate | date:'dd/MM/yyyy':'UTC') : '—' }}</td><td data-label="Fases">Fase {{ item.fromPhase.order }} → Fase {{ item.toPhase.order }}</td>
          <td data-label="Situação">{{ item.status === 'OPEN' ? 'Em aberto' : 'Resolvida' }}</td><td>@if (item.status === 'OPEN') { <button type="button" class="quiet-button" (click)="resolve(item)">Marcar resolvida</button> }</td></tr>
        } @empty { <tr><td colspan="6" class="empty-row">Nenhuma pendência transferida. Pendências nunca são apagadas; apenas resolvidas.</td></tr> }</tbody></table></div>
      <form class="task-form inline-form" (ngSubmit)="addCarried()"><h3>Transferir pendência não bloqueante</h3>
        <div class="form-grid"><label>Fase de origem (em encerramento)<select name="fromPhaseId" required [(ngModel)]="cForm.fromPhaseId">@for (p of d()?.phases ?? []; track p.id) { <option [value]="p.id">Fase {{ p.order }} — {{ p.name }}</option> }</select></label>
          <label>Fase de destino<select name="toPhaseId" required [(ngModel)]="cForm.toPhaseId">@for (p of d()?.phases ?? []; track p.id) { <option [value]="p.id">Fase {{ p.order }} — {{ p.name }}</option> }</select></label>
          <label>Descrição<input name="description" required minlength="3" [(ngModel)]="cForm.description"></label><label>Responsável<input name="responsible" required [(ngModel)]="cForm.responsible"></label>
          <label>Prazo<input type="date" name="dueDate" [(ngModel)]="cForm.dueDate"></label></div>
        <button type="submit" [disabled]="saving()" data-testid="c-add">Registrar transferência</button></form>
    </section>
  </main>`,
})
export class ProjectManageComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef); private readonly auth = inject(AuthService); private readonly dialogs = inject(DialogService);
  projectId = '';
  readonly d = signal<ProjectDashboard | null>(null); readonly history = signal<StatusHistory>({ status: '', events: [] }); readonly status = signal(''); readonly sustainment = signal<Sustainment[]>([]); readonly carried = signal<Carried[]>([]);
  readonly mode = signal<'hold' | 'cancel' | 'resume' | null>(null); readonly saving = signal(false); readonly notice = signal(''); readonly error = signal('');
  form = { reason: '', effectiveDate: today(), note: '', expectedResumeDate: '', confirmPassword: '' };
  sForm = { routine: '', frequency: '', responsible: '', indicator: '', criterion: '', nextReviewDate: '' };
  cForm = { fromPhaseId: '', toPhaseId: '', description: '', responsible: '', dueDate: '' };
  isAdmin() { return this.auth.user()?.role === 'JGM4_ADMIN' || !!this.auth.user()?.dev; }
  label(status: string) { return projectStatusLabels[status] ?? status; } statusLabel(status: string) { return this.label(status); }
  ngOnInit() { this.projectId = this.route.snapshot.paramMap.get('id') ?? ''; this.reload(); }
  private api(path: string) { return `/api/projects/${this.projectId}/${path}`; }
  private fail(e: HttpErrorResponse) { this.saving.set(false); const m = e.error?.message; this.error.set(Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : 'A operação não foi concluída.'); }
  reload() {
    forkJoin({ d: this.http.get<ProjectDashboard>(this.api('dashboard')), history: this.http.get<StatusHistory>(this.api('status')), sustainment: this.http.get<Sustainment[]>(this.api('sustainment')), carried: this.http.get<Carried[]>(this.api('carried-items')) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (x) => { this.d.set(x.d); this.history.set(x.history); this.status.set(x.history.status); this.sustainment.set(x.sustainment); this.carried.set(x.carried);
        if (!this.cForm.fromPhaseId && x.d.phases.length) { this.cForm.fromPhaseId = x.d.phases[0].id; this.cForm.toPhaseId = x.d.phases[1]?.id ?? x.d.phases[0].id; } }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  async submitStatus() {
    const mode = this.mode(); if (!mode) return;
    if (mode === 'cancel' && !(await this.dialogs.confirm({ title: 'Cancelar o projeto?', message: 'Ele passará a ser somente consulta e esta ação não pode ser desfeita.', confirmLabel: 'Cancelar projeto', danger: true }))) return;
    const body: Record<string, string> = { reason: this.form.reason };
    if (mode !== 'resume') { body['effectiveDate'] = this.form.effectiveDate; body['note'] = this.form.note; if (mode === 'hold' && this.form.expectedResumeDate) body['expectedResumeDate'] = this.form.expectedResumeDate; if (mode === 'cancel') body['confirmPassword'] = this.form.confirmPassword; }
    this.saving.set(true); this.error.set('');
    this.http.post(this.api(`status/${mode}`), body).subscribe({ next: () => { this.saving.set(false); this.mode.set(null); this.notice.set('Situação do projeto atualizada e registrada na auditoria.'); this.form = { reason: '', effectiveDate: today(), note: '', expectedResumeDate: '', confirmPassword: '' }; this.reload(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  addSustainment() {
    const body = Object.fromEntries(Object.entries(this.sForm).filter(([, value]) => value));
    this.saving.set(true); this.error.set('');
    this.http.post(this.api('sustainment'), body).subscribe({ next: () => { this.saving.set(false); this.notice.set('Item de sustentação adicionado.'); this.sForm = { routine: '', frequency: '', responsible: '', indicator: '', criterion: '', nextReviewDate: '' }; this.reload(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  deactivate(item: Sustainment) { this.http.patch(this.api(`sustainment/${item.id}`), { active: false }).subscribe({ next: () => { this.notice.set('Item desativado (o histórico é preservado).'); this.reload(); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  addCarried() {
    const body = Object.fromEntries(Object.entries(this.cForm).filter(([, value]) => value)); this.saving.set(true); this.error.set('');
    this.http.post(this.api('carried-items'), body).subscribe({ next: () => { this.saving.set(false); this.notice.set('Pendência transferida e registrada.'); this.cForm.description = ''; this.cForm.responsible = ''; this.cForm.dueDate = ''; this.reload(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  resolve(item: Carried) { this.http.post(this.api(`carried-items/${item.id}/resolve`), {}).subscribe({ next: () => { this.notice.set('Pendência marcada como resolvida.'); this.reload(); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
}
