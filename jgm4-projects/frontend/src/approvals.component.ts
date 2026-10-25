import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, EMPTY, catchError, forkJoin, switchMap } from 'rxjs';
import { ActorService, ApprovalSummary } from './actor.service';

interface ApprovalItem {
  id: string; projectId: string; projectName: string; companyName: string; type: string; typeLabel: string; category: string; code: string | null; title: string; description: string;
  status: string; priority: string; requestedAt: string; dueAt: string | null; overdue: boolean; requestedByLabel: string; owner: { type: string; label: string };
  nextAction: string; impact: string; canDecide: boolean; deniedReason: string | null; decisionComment: string | null; decision: string | null; decidedAt: string | null; decidedByRole: string | null;
  entityType: string; entityId: string; payload: Record<string, any> | null; actions: { labels: { approve: string; adjust: string; reject: string } };
}
interface ApprovalDetail extends ApprovalItem {
  context: { kind: string; code: string; title: string; description: string; instructions?: string; acceptanceCriteria?: string; status: string; requirements?: { label: string; completed: boolean }[];
    evidence?: { description: string; referenceUrl: string | null }[]; criteria?: { code: string; description: string; satisfied: boolean; evidenceReference: string | null }[];
    activities?: { code: string; title: string; status: string }[]; technicalOpinion?: string | null; technicalRecommendation?: string | null } | null;
  history: { id: string; action: string; actorType: string; createdAt: string }[];
  previousApprovals: { id: string; type: string; status: string; decisionComment: string | null; decidedAt: string | null; decidedByRole: string | null }[];
}
type Outcome = 'approve' | 'adjust' | 'reject';
const priorityLabels: Record<string, string> = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', CRITICAL: 'Crítica' };
const statusLabels: Record<string, string> = { PENDING: 'Pendente', IN_REVIEW: 'Em análise', APPROVED: 'Aprovada', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' };
const outcomePath: Record<Outcome, string> = { approve: 'approve', adjust: 'request-adjustment', reject: 'reject' };

@Component({
  selector: 'app-approvals', imports: [DatePipe, FormsModule, RouterLink],
  template: `<main>
    <div class="page-heading"><div><p class="eyebrow">CENTRAL DE APROVAÇÕES</p><h1>O que está aguardando minha ação?</h1><p class="lead">Perfil atual: <strong>{{ summary()?.role || '…' }}</strong>. Tudo o que depende da sua decisão, em um só lugar.</p></div><button class="secondary" (click)="refresh()">Atualizar</button></div>

    @if (summary(); as s) {
      <section class="metrics approval-cards" aria-label="Aguardando minha ação">
        <article><p>Aguardando minha ação</p><div><strong data-testid="total-pending">{{ s.total }}</strong><span>itens</span></div><small>{{ s.overdue }} atrasados · {{ s.high }} de alta prioridade</small></article>
        @for (card of cards(s); track card.id) {
          <button type="button" class="approval-card" [class.selected]="category() === card.id" [attr.data-testid]="'card-' + card.id" (click)="setCategory(category() === card.id ? 'ALL' : card.id)"><p>{{ card.label }}</p><div><strong>{{ card.value }}</strong></div></button>
        }
      </section>
    }

    <div class="filter-tabs" role="group" aria-label="Filtrar aprovações">
      @for (tab of tabs; track tab.id) { <button type="button" [class.selected]="category() === tab.id" [attr.aria-pressed]="category() === tab.id" (click)="setCategory(tab.id)">{{ tab.label }}</button> }
      <button type="button" [class.selected]="due() === 'today'" [attr.aria-pressed]="due() === 'today'" (click)="toggleDue('today')">Hoje</button>
      <button type="button" [class.selected]="due() === 'overdue'" [attr.aria-pressed]="due() === 'overdue'" (click)="toggleDue('overdue')">Atrasados</button>
      <button type="button" [class.selected]="highOnly()" [attr.aria-pressed]="highOnly()" (click)="toggleHigh()">Alta prioridade</button>
      <button type="button" [class.selected]="history()" [attr.aria-pressed]="history()" (click)="toggleHistory()">Histórico de decisões</button>
    </div>
    <div class="approval-project-filter"><label for="approval-project">Projeto</label>
      <select id="approval-project" [ngModel]="projectId()" (ngModelChange)="setProject($event)"><option value="">Todos os projetos</option>@for (p of projects(); track p.id) { <option [value]="p.id">{{ p.company.name }} · {{ p.name }}</option> }</select></div>

    @if (notice()) { <p class="success-note" role="status">{{ notice() }}</p> }
    @if (loading()) { <section class="state-panel" aria-live="polite">Carregando aprovações…</section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Consulta indisponível</h2><p>{{ error() }}</p></section> }
    @else {
      <p class="list-count" aria-live="polite">{{ items().length }} {{ items().length === 1 ? 'item' : 'itens' }} {{ history() ? 'no histórico' : 'aguardando ação' }}</p>
      <div class="request-table-wrap"><table class="request-table approval-table"><caption class="sr-only">Aprovações pendentes</caption>
        <thead><tr><th>Tipo</th><th>Código</th><th>Projeto</th><th>Descrição</th><th>Responsável</th><th>Recebido em</th><th>Prazo</th><th>Prioridade</th><th>Ação</th></tr></thead>
        <tbody>
        @for (item of items(); track item.id) {
          <tr data-testid="approval-row" [class.row-selected]="item.id === selectedId()">
            <td data-label="Tipo"><span class="badge" [class.badge-gate]="item.category === 'GATES'">{{ item.typeLabel }}</span></td>
            <td data-label="Código"><a [routerLink]="['/approvals', item.id]" class="code-link">{{ item.code || '—' }}</a></td>
            <td data-label="Projeto">{{ item.projectName }}<small>{{ item.companyName }}</small></td>
            <td data-label="Descrição"><a [routerLink]="['/approvals', item.id]">{{ item.title }}</a><small>{{ item.impact }}</small></td>
            <td data-label="Responsável"><strong class="owner-label">{{ item.owner.label }}</strong><small>{{ item.nextAction }}</small></td>
            <td data-label="Recebido em">{{ item.requestedAt | date:'dd/MM' }}<small>{{ item.requestedByLabel }}</small></td>
            <td data-label="Prazo" [class.overdue]="item.overdue">{{ item.dueAt ? (item.dueAt | date:'dd/MM':'UTC') : '—' }}@if (item.overdue) { <small>Atrasado</small> }</td>
            <td data-label="Prioridade"><span class="priority" [class.priority-high]="item.priority === 'HIGH' || item.priority === 'CRITICAL'">{{ prio(item.priority) }}</span>@if (item.status !== 'PENDING') { <small>{{ stat(item.status) }}</small> }</td>
            <td data-label="Ação"><a class="row-action" [routerLink]="['/approvals', item.id]">{{ item.status === 'PENDING' || item.status === 'IN_REVIEW' ? (item.canDecide ? 'Decidir' : 'Ver') : 'Ver' }}</a></td>
          </tr>
        } @empty { <tr><td colspan="9" class="empty-row">Nada aguardando sua ação neste filtro.</td></tr> }
        </tbody></table></div>
    }

    @if (detail(); as d) {
      <section class="panel approval-detail" aria-label="Detalhe da aprovação" data-testid="approval-detail">
        <div class="section-heading"><div><p class="eyebrow">{{ d.type === 'GATE_TECHNICAL_OPINION' ? 'PARECER TÉCNICO JGM4' : d.type === 'GATE_CLIENT_DECISION' ? 'DECISÃO DE ' + d.companyName.toUpperCase() : d.typeLabel.toUpperCase() }}</p><h2>{{ d.title }}</h2></div><a class="row-action" routerLink="/approvals">Fechar</a></div>
        @if (d.type === 'GATE_TECHNICAL_OPINION') { <p class="role-banner">Parecer técnico da JGM4. A decisão de avançar a fase é do patrocinador {{ d.companyName }} e acontece depois.</p> }
        @if (d.type === 'GATE_CLIENT_DECISION') { <p class="role-banner">Decisão reservada ao patrocinador {{ d.companyName }}. A JGM4 já emitiu o parecer técnico favorável.</p> }
        <dl class="detail-facts approval-facts">
          <div><dt>Projeto</dt><dd>{{ d.companyName }} · {{ d.projectName }}</dd></div>
          <div><dt>Tipo</dt><dd>{{ d.typeLabel }}</dd></div>
          <div><dt>Enviado por</dt><dd>{{ d.requestedByLabel }}</dd></div>
          <div><dt>Enviado em</dt><dd>{{ d.requestedAt | date:'dd/MM/yyyy HH:mm' }}</dd></div>
          <div><dt>Prazo</dt><dd [class.overdue]="d.overdue">{{ d.dueAt ? (d.dueAt | date:'dd/MM/yyyy':'UTC') : '—' }}{{ d.overdue ? ' · atrasado' : '' }}</dd></div>
          <div><dt>Situação</dt><dd>{{ stat(d.status) }} · prioridade {{ prio(d.priority).toLowerCase() }}</dd></div>
        </dl>
        <div class="next-action approval-ball"><div><span>Responsável atual</span><strong>{{ d.owner.label }}</strong></div><div><span>Próxima ação</span><strong>{{ d.nextAction }}</strong></div><div><span>Impacto</span><strong>{{ d.impact }}</strong></div></div>

        <h3>Descrição</h3><p>{{ d.description }}</p>
        @if (d.payload && d.type === 'DUE_DATE_CHANGE') { <h3>Alteração solicitada</h3><p>Prazo atual <strong>{{ d.payload['currentDate'] ? (d.payload['currentDate'] | date:'dd/MM/yyyy':'UTC') : 'não definido' }}</strong> → novo prazo <strong>{{ d.payload['newDate'] | date:'dd/MM/yyyy':'UTC' }}</strong> ({{ d.payload['deltaDays'] }} dias).</p><p>Justificativa: {{ d.payload['justification'] }}</p>@if (d.payload['expectedImpact']) { <p>Impacto esperado: {{ d.payload['expectedImpact'] }}</p> } }
        @if (d.payload && d.type === 'RESPONSIBLE_CHANGE') { <h3>Troca solicitada</h3><p>{{ d.payload['currentName'] || 'A definir' }} → <strong>{{ d.payload['newName'] }}</strong></p><p>Justificativa: {{ d.payload['justification'] }}</p> }
        @if (d.payload && (d.type === 'TASK_REOPEN' || d.type === 'REQUEST_CANCEL')) { <h3>Motivo informado</h3><p>{{ d.payload['reason'] }}</p> }
        @if (d.context; as c) {
          @if (c.instructions) { <h3>Instruções</h3><p>{{ c.instructions }}</p> }
          @if (c.acceptanceCriteria) { <h3>Critério de aceite</h3><p>{{ c.acceptanceCriteria }}</p> }
          @if (c.requirements?.length) { <h3>Requisitos</h3><ul class="check-list">@for (r of c.requirements; track r.label) { <li [class.done]="r.completed">{{ r.completed ? '✔' : '○' }} {{ r.label }}</li> }</ul> }
          @if (c.evidence?.length) { <h3>Evidências</h3>@for (e of c.evidence; track e.description) { <p>{{ e.description }} @if (e.referenceUrl) { <a [href]="e.referenceUrl" target="_blank" rel="noopener noreferrer">abrir referência</a> }</p> } }
          @if (c.criteria?.length) { <h3>Critérios do Gate</h3><ul class="check-list">@for (r of c.criteria; track r.code) { <li [class.done]="r.satisfied">{{ r.satisfied ? '✔' : '○' }} {{ r.code }} · {{ r.description }}@if (r.evidenceReference) { <small> — {{ r.evidenceReference }}</small> }</li> }</ul> }
          @if (c.activities?.length) { <h3>Atividades da fase</h3><p>@for (a of c.activities; track a.code) { <span class="chip">{{ a.code }} · {{ a.status }}</span> }</p> }
          @if (c.technicalOpinion) { <h3>Parecer técnico JGM4</h3><p>{{ c.technicalOpinion }}</p> }
        }
        @if (d.history.length) { <h3>Histórico relevante</h3><ol class="history-list">@for (h of d.history; track h.id) { <li><div><strong>{{ h.action.replaceAll('_', ' ') }}</strong><span>{{ h.createdAt | date:'dd/MM HH:mm' }} · {{ h.actorType }}</span></div></li> }</ol> }
        @if (d.previousApprovals.length) { <h3>Decisões anteriores sobre este item</h3>@for (p of d.previousApprovals; track p.id) { <p class="muted-copy">{{ stat(p.status) }} · {{ p.decidedByRole }} · {{ p.decidedAt | date:'dd/MM HH:mm' }} — {{ p.decisionComment }}</p> } }

        @if (d.status === 'APPROVED' || d.status === 'ADJUSTMENT_REQUESTED' || d.status === 'REJECTED') {
          <p class="success-note">Decisão registrada: <strong>{{ stat(d.status) }}</strong> por {{ d.decidedByRole }} em {{ d.decidedAt | date:'dd/MM/yyyy HH:mm' }}. {{ d.decisionComment }}</p>
        } @else if (d.canDecide) {
          <div class="action-buttons" aria-label="Decisão">
            <button type="button" data-testid="btn-approve" (click)="open('approve')">{{ d.actions.labels.approve }}</button>
            <button type="button" class="secondary" data-testid="btn-adjust" (click)="open('adjust')">{{ d.actions.labels.adjust }}</button>
            <button type="button" class="secondary danger" data-testid="btn-reject" (click)="open('reject')">{{ d.actions.labels.reject }}</button>
          </div>
          @if (action(); as a) {
            <form class="task-form inline-form" (ngSubmit)="submit(d)">
              @if (a === 'approve' && d.type === 'GATE_TECHNICAL_OPINION') { <label>Parecer técnico (obrigatório)<textarea name="opinion" rows="3" required [(ngModel)]="form.technicalOpinion"></textarea></label> }
              @if (a !== 'approve') { <label>{{ a === 'adjust' ? 'Motivo (obrigatório)' : 'Motivo da rejeição (obrigatório)' }}<textarea name="reason" rows="2" required [(ngModel)]="form.comment"></textarea></label> }
              @if (a === 'approve' && d.type !== 'GATE_TECHNICAL_OPINION') { <label>Comentário (opcional)<textarea name="note" rows="2" [(ngModel)]="form.comment"></textarea></label> }
              @if (a === 'adjust') { <label>Instrução clara para o ajuste (obrigatória)<textarea name="instructions" rows="2" required [(ngModel)]="form.instructions"></textarea></label><label>Prazo sugerido (opcional)<input type="date" name="suggested" [(ngModel)]="form.suggestedDueDate"></label> }
              <div class="action-buttons"><button type="submit" [disabled]="saving()" data-testid="btn-confirm">Confirmar {{ a === 'approve' ? d.actions.labels.approve.toLowerCase() : a === 'adjust' ? d.actions.labels.adjust.toLowerCase() : d.actions.labels.reject.toLowerCase() }}</button><button type="button" class="secondary" (click)="action.set(null)">Cancelar</button></div>
            </form>
          }
        } @else if (d.deniedReason) { <p class="error-note" role="note" data-testid="denied">{{ d.deniedReason }}</p> }
        @if (decisionError()) { <p class="error-note" role="alert">{{ decisionError() }}</p> }
      </section>
    }
    <p class="scope-note">Aprovar, solicitar ajuste e rejeitar são registrados no fluxo original (solicitação, atividade ou Gate) e na auditoria. Decisões nunca são apagadas.</p>
  </main>`,
})
export class ApprovalsComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  private readonly actor = inject(ActorService);
  private readonly reload$ = new BehaviorSubject(0);
  readonly summary = this.actor.summary; readonly items = signal<ApprovalItem[]>([]); readonly detail = signal<ApprovalDetail | null>(null); readonly projects = signal<{ id: string; name: string; company: { name: string } }[]>([]);
  readonly category = signal('ALL'); readonly due = signal(''); readonly highOnly = signal(false); readonly history = signal(false); readonly projectId = signal('');
  readonly selectedId = signal(''); readonly loading = signal(true); readonly error = signal(''); readonly notice = signal(''); readonly decisionError = signal(''); readonly saving = signal(false); readonly action = signal<Outcome | null>(null);
  form = { comment: '', instructions: '', suggestedDueDate: '', technicalOpinion: '' };
  readonly tabs = [{ id: 'ALL', label: 'Todos' }, { id: 'REQUESTS', label: 'Solicitações' }, { id: 'TASKS', label: 'Atividades' }, { id: 'GATES', label: 'Gates' }, { id: 'CHANGES', label: 'Alterações' }];
  prio(value: string) { return priorityLabels[value] ?? value; } stat(value: string) { return statusLabels[value] ?? value; }
  cards(s: ApprovalSummary) { return [{ id: 'REQUESTS', label: 'Solicitações', value: s.requests }, { id: 'TASKS', label: 'Atividades', value: s.tasks }, { id: 'GATES', label: 'Gates', value: s.gates }, { id: 'CHANGES', label: 'Alterações', value: s.changes }]; }

  ngOnInit() {
    this.http.get<{ id: string; name: string; company: { name: string } }[]>('/api/projects').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => this.projects.set(p));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => { const id = q.get('projectId') ?? ''; if (id !== this.projectId()) { this.projectId.set(id); this.reload$.next(this.reload$.value + 1); } });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => { this.selectedId.set(p.get('id') ?? ''); this.action.set(null); this.error.set(''); this.loadDetail(); });
    this.reload$.pipe(switchMap(() => {
      this.loading.set(true); this.error.set('');
      const params: Record<string, string> = { category: this.category(), status: this.history() ? 'all' : 'open', scope: this.history() ? 'all' : 'mine' };
      if (this.due()) params['due'] = this.due(); if (this.highOnly()) params['priority'] = 'high'; if (this.projectId()) params['projectId'] = this.projectId();
      return this.http.get<ApprovalItem[]>('/api/approvals', { params }).pipe(catchError((e: HttpErrorResponse) => { this.error.set(e.error?.message || 'Não foi possível carregar as aprovações.'); this.loading.set(false); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((items) => { this.items.set(items); this.loading.set(false); });
    this.actor.refresh();
  }
  private loadDetail() {
    const id = this.selectedId(); if (!id) { this.detail.set(null); return; }
    this.http.get<ApprovalDetail>(`/api/approvals/${encodeURIComponent(id)}`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (d) => this.detail.set(d), error: (e: HttpErrorResponse) => { this.detail.set(null); this.error.set(e.error?.message || 'Aprovação não encontrada.'); } });
  }
  private apply() { this.reload$.next(this.reload$.value + 1); }
  setCategory(id: string) { this.category.set(id); this.apply(); }
  toggleDue(value: string) { this.due.set(this.due() === value ? '' : value); this.apply(); }
  toggleHigh() { this.highOnly.set(!this.highOnly()); this.apply(); }
  toggleHistory() { this.history.set(!this.history()); this.apply(); }
  setProject(id: string) { this.projectId.set(id); void this.router.navigate([], { queryParams: { projectId: id || null }, queryParamsHandling: 'merge' }); }
  refresh() { this.notice.set(''); this.apply(); this.actor.refresh(); this.loadDetail(); }
  open(outcome: Outcome) { this.action.set(outcome); this.form = { comment: '', instructions: '', suggestedDueDate: '', technicalOpinion: '' }; this.decisionError.set(''); }
  submit(d: ApprovalDetail) {
    const outcome = this.action(); if (!outcome) return;
    const body: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.form)) if (value.trim()) body[key] = value.trim();
    this.saving.set(true); this.decisionError.set('');
    this.http.post<ApprovalDetail>(`/api/approvals/${encodeURIComponent(d.id)}/${outcomePath[outcome]}`, body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => { this.saving.set(false); this.action.set(null); this.detail.set(updated); this.notice.set(`Decisão registrada em ${updated.code}.`); this.apply(); this.actor.refresh(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); const m = e.error?.message; this.decisionError.set(Array.isArray(m) ? m.join(' ') : m || 'A decisão não foi registrada.'); },
    });
  }
}
