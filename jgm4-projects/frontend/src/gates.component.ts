import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { DialogService } from './ui/dialog.service';
import { UI } from './ui/ui.components';
import { auditActionLabel, ownerLabels, requestStatusLabels, statusLabel, taskStatusLabels } from './ui/labels';
import { friendlyError } from './ui/labels';

const RECOMMENDATIONS: Record<string, string> = { ADVANCE: 'Recomenda o avanço', DO_NOT_ADVANCE: 'Recomenda correção antes de avançar' };
const DECISIONS: Record<string, string> = { APPROVE: 'Avanço aprovado', HOLD: 'Mantido em espera', REJECT: 'Avanço rejeitado' };

// Gates: pontos formais de decisão entre as fases. A JGM4 emite o parecer técnico; o patrocinador do cliente confirma o avanço.
@Component({
  selector: 'app-gates', imports: [RouterLink, ProjectNavComponent, ...UI],
  template: `
<main>
  <ui-page-header eyebrow="PLANO · DECISÕES DE FASE" title="Gates do projeto" subtitle="A JGM4 emite o parecer técnico. O patrocinador do cliente confirma o avanço de cada fase." />
  @if (projectId()) { <app-project-nav [projectId]="projectId()" /> }
  @if (error()) { <ui-alert tone="danger" title="Não foi possível carregar os Gates">{{ error() }}</ui-alert> }
  @if (loading() && !error()) { <ui-loading message="Carregando os Gates…" /> }

  @if (!gateId() && !loading()) {
    <section class="gate-sequence" aria-label="Sequência de Gates">
      <ui-section-header eyebrow="SEQUÊNCIA DE DECISÃO" title="Gates do projeto" />
      @for (gate of gates(); track gate.id) {
        <a class="phase-card gate-list-card" [class]="'phase-card gate-list-card gate-tone-' + tone(gate.status)" [routerLink]="['/projects', projectId(), 'gates', gate.id]">
          <span class="gate-marker" aria-hidden="true">{{ icon(gate.status) }}</span>
          <div class="gate-card-body">
            <span class="phase-caption">Gate {{ gate.phase.order }} · Fase {{ gate.phase.order }} — {{ gate.phase.name }}</span>
            <h3>{{ gate.title }}</h3>
            <p>{{ gate.question }}</p>
            <div class="gate-state"><ui-badge [status]="gate.status" domain="gate" /> <span>{{ gate.status === 'BLOCKED' ? 'A fase ainda possui atividades ou solicitações pendentes.' : (gate.nextAction || 'Consultar critérios e próxima ação.') }}</span></div>
            <small>{{ gate.missingCriteria?.length ?? 0 }} critério(s) obrigatório(s) pendente(s)</small>
          </div>
        </a>
      } @empty { <ui-empty title="Nenhum Gate neste projeto" message="Os Gates aparecem quando a estrutura do projeto é criada a partir de um template." /> }
    </section>
  } @else if (gate(); as current) {
    <p><a class="small-link" [routerLink]="['/projects', projectId(), 'gates']">← Todos os Gates</a></p>
    <section class="panel gate-hero" [class]="'panel gate-hero gate-tone-' + tone(current.status)">
      <div class="gate-hero-head"><span class="gate-marker large" aria-hidden="true">{{ icon(current.status) }}</span><div><p class="eyebrow">PONTO DE DECISÃO · FASE {{ current.phase.order }}</p><h2>Gate {{ current.phase.order }} · {{ current.title }}</h2></div><ui-badge [status]="current.status" domain="gate" /></div>
      <p class="gate-question"><strong>Pergunta de decisão:</strong> {{ current.question }}</p>
      @if (current.blockedReason) { <ui-alert tone="warning" title="Gate bloqueado">{{ current.blockedReason }}</ui-alert> }
      <dl class="gate-facts"><div><dt>Responsável agora</dt><dd>{{ owner(current.currentOwnerType) }}</dd></div><div><dt>Próxima ação</dt><dd>{{ current.nextAction || 'Aguardando pré-requisitos.' }}</dd></div><div><dt>Critérios</dt><dd>{{ satisfiedCount(current.criteria) }} de {{ current.criteria.length }} atendidos</dd></div></dl>
      <ui-progress [value]="current.criteria.length ? (satisfiedCount(current.criteria) / current.criteria.length) * 100 : 0" [caption]="satisfiedCount(current.criteria) + ' / ' + current.criteria.length + ' critérios'" ariaLabel="Critérios atendidos" />
    </section>

    <section class="panel" aria-label="Critérios do Gate">
      <ui-section-header title="Critérios e evidências"><span>{{ satisfiedCount(current.criteria) }} / {{ current.criteria.length }} atendidos</span></ui-section-header>
      <ul class="criteria-list">
        @for (c of current.criteria; track c.id) {
          <li class="criterion" [class.done]="c.satisfied" [class.attention]="!c.satisfied && current.status === 'CORRECTION_REQUIRED'">
            <span class="criterion-icon" aria-hidden="true">{{ c.satisfied ? '✓' : (current.status === 'CORRECTION_REQUIRED' ? '!' : '○') }}</span>
            <div class="criterion-text"><strong>{{ c.code }} · {{ c.description }}</strong>
              <small>{{ c.sourceType === 'TASK' || c.sourceType === 'REQUEST' ? 'Verificado automaticamente' : (c.evidenceRequired ? 'Critério técnico; requer referência de evidência' : 'Critério técnico JGM4') }}</small>
              @if (c.evidenceReference) { <small>Evidência: {{ c.evidenceReference }}</small> }</div>
            <div class="criterion-state"><ui-badge [tone]="c.satisfied ? 'success' : (current.status === 'CORRECTION_REQUIRED' ? 'danger' : 'neutral')" [label]="c.satisfied ? 'Concluído' : (current.status === 'CORRECTION_REQUIRED' ? 'Ajuste necessário' : 'Pendente')" />
              @if (current.status === 'UNDER_REVIEW' && current.localActor === 'JGM4_CONSULTANT' && c.sourceType !== 'TASK' && c.sourceType !== 'REQUEST') { <button type="button" class="secondary" (click)="setCriterion(c)">{{ c.satisfied ? 'Reabrir' : 'Validar' }}</button> }</div>
          </li>
        }
      </ul>
    </section>

    <section class="decision-grid" aria-label="Parecer e decisão">
      <article class="panel decision-card technical"><p class="eyebrow">PARECER TÉCNICO JGM4</p><h2>{{ recommendation(current.technicalRecommendation) }}</h2><p class="text-muted">{{ current.technicalOpinion || 'O parecer será registrado após a avaliação dos critérios.' }}</p></article>
      <article class="panel decision-card client"><p class="eyebrow">DECISÃO DO CLIENTE</p><h2>{{ decisionLabel(current.clientDecision) }}</h2><p class="text-muted">{{ current.clientDecisionComment || 'A decisão do patrocinador será registrada aqui.' }}</p></article>
    </section>

    @if (current.status === 'CORRECTION_REQUIRED' && current.correctionReason) { <ui-alert tone="danger" title="Correção solicitada">{{ current.correctionReason }}@if (current.correctionInstructions) { — {{ current.correctionInstructions }} }</ui-alert> }

    <section class="panel">
      <ui-section-header title="Atividades da fase" />
      @for (t of current.activities; track t.id) { <p class="gate-item"><strong>{{ t.code }}</strong> · {{ t.title }} <ui-badge [status]="t.status" domain="task" /></p> } @empty { <p class="text-muted">Nenhuma atividade nesta fase.</p> }
      <h3>Solicitações bloqueantes</h3>
      @for (r of current.requests; track r.id) { <p class="gate-item"><strong>{{ r.code }}</strong> · {{ r.title }} <ui-badge [status]="r.status" domain="request" /></p> } @empty { <p class="text-muted">Nenhuma solicitação bloqueante.</p> }
    </section>

    <section class="action-buttons" aria-label="Ações do Gate">
      @if (current.status === 'AVAILABLE' && current.localActor === 'JGM4_CONSULTANT') { <button type="button" (click)="act('start-review', {})">Iniciar análise</button> }
      @if (current.status === 'UNDER_REVIEW' && current.localActor === 'JGM4_CONSULTANT') { <button type="button" class="secondary" (click)="correction()">Solicitar correção</button><button type="button" (click)="opinion()">Emitir parecer técnico</button> }
      @if (current.status === 'CORRECTION_REQUIRED' && current.localActor === 'JGM4_CONSULTANT') { <button type="button" (click)="act('resume-review', {})">Retomar análise</button> }
      @if (current.status === 'TECHNICALLY_APPROVED' && current.canClientDecide) { <button type="button" (click)="decision('APPROVE')">Aprovar avanço</button><button type="button" class="secondary" (click)="decision('HOLD')">Manter em espera</button><button type="button" class="danger" (click)="decision('REJECT')">Rejeitar</button> }
    </section>

    @if (history().length) {
      <section class="panel"><ui-section-header title="Histórico" />
        <ol class="history-list">@for (h of history(); track h.id) { <li><div><strong>{{ actionLabel(h.action) }}</strong><span>{{ h.createdAt | fmtDateTime }}</span></div></li> }</ol></section>
    }
  }
</main>`,
})
export class GatesComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroy = inject(DestroyRef); private readonly dialogs = inject(DialogService);
  readonly projectId = signal(''); readonly gateId = signal(''); readonly gates = signal<any[]>([]); readonly gate = signal<any | null>(null); readonly history = signal<any[]>([]); readonly error = signal(''); readonly loading = signal(true);
  ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy), switchMap((p) => {
      const pid = p.get('id') || ''; const gid = p.get('gateId') || '';
      this.projectId.set(pid); this.gateId.set(gid); this.error.set(''); this.loading.set(true); this.gate.set(null);
      return this.http.get<any>(`/api/projects/${encodeURIComponent(pid)}/gates${gid ? '/' + encodeURIComponent(gid) : ''}`);
    })).subscribe({
      next: (data) => { this.loading.set(false); if (Array.isArray(data)) this.gates.set(data); else { this.gate.set(data); this.history.set(data.history || []); } },
      error: (e: HttpErrorResponse) => { this.loading.set(false); this.error.set(friendlyError(e.status, undefined, 'carregar os Gates')); },
    });
  }
  tone(status: string) { return { BLOCKED: 'blocked', AVAILABLE: 'open', UNDER_REVIEW: 'review', CORRECTION_REQUIRED: 'correction', TECHNICALLY_APPROVED: 'review', APPROVED: 'approved', REJECTED: 'correction', CLOSED: 'approved' }[status] ?? 'blocked'; }
  icon(status: string) { return { BLOCKED: '🔒', AVAILABLE: '◇', UNDER_REVIEW: '◐', CORRECTION_REQUIRED: '!', TECHNICALLY_APPROVED: '◐', APPROVED: '✓', REJECTED: '✕', CLOSED: '✓' }[status] ?? '◇'; }
  owner(type: string) { return ownerLabels[type] ?? statusLabel('gate', type); }
  recommendation(value: string | null) { return value ? RECOMMENDATIONS[value] ?? value : 'Aguardando análise'; }
  decisionLabel(value: string | null) { return value ? DECISIONS[value] ?? value : 'Aguardando decisão'; }
  actionLabel(action: string) { return auditActionLabel(action); }
  satisfiedCount(criteria: any[]) { return criteria.filter((c) => c.satisfied).length; }
  private refresh() { this.http.get<any>(`/api/projects/${this.projectId()}/gates/${this.gateId()}`).subscribe({ next: (d) => { this.gate.set(d); this.history.set(d.history || []); }, error: (e: HttpErrorResponse) => this.error.set(friendlyError(e.status, undefined, 'atualizar o Gate')) }); }
  act(action: string, body: any) { this.http.post(`/api/gates/${this.gateId()}/${action}`, body).subscribe({ next: () => this.refresh(), error: (e: HttpErrorResponse) => this.error.set(friendlyError(e.status, Array.isArray(e.error?.message) ? e.error.message.join(' ') : e.error?.message, 'concluir a ação')) }); }
  async setCriterion(c: any) {
    const satisfied = !c.satisfied; let evidenceReference = '';
    if (satisfied && c.evidenceRequired) { evidenceReference = (await this.dialogs.prompt({ title: 'Validar critério', message: c.description, label: 'Referência da evidência (URL ou identificação)', confirmLabel: 'Validar' })) ?? ''; if (!evidenceReference) return; }
    this.act('criteria', { criterionId: c.id, satisfied, evidenceReference });
  }
  async correction() {
    const result = await this.dialogs.ask({ title: 'Solicitar correção', message: 'A fase volta para ajustes antes do avanço.', confirmLabel: 'Solicitar correção', fields: [{ name: 'reason', label: 'Motivo da correção', type: 'textarea', required: true }, { name: 'instructions', label: 'Orientações para correção', type: 'textarea', required: true }] });
    if (result) this.act('request-correction', { correctionReason: result['reason'], correctionInstructions: result['instructions'] });
  }
  async opinion() {
    const result = await this.dialogs.ask({ title: 'Emitir parecer técnico', confirmLabel: 'Registrar parecer', fields: [{ name: 'recommendation', label: 'Recomendação', type: 'select', options: [{ value: 'ADVANCE', label: 'Recomendar o avanço' }, { value: 'DO_NOT_ADVANCE', label: 'Recomendar correção antes de avançar' }], value: 'ADVANCE' }, { name: 'opinion', label: 'Parecer técnico', type: 'textarea', required: true }] });
    if (result) this.act('technical-opinion', { technicalRecommendation: result['recommendation'], technicalOpinion: result['opinion'] });
  }
  async decision(clientDecision: string) {
    const titles: Record<string, string> = { APPROVE: 'Aprovar o avanço da fase?', HOLD: 'Manter a fase em espera?', REJECT: 'Rejeitar o avanço da fase?' };
    const result = await this.dialogs.ask({ title: titles[clientDecision], message: 'Sua decisão fica registrada com data e responsável.', confirmLabel: 'Registrar decisão', danger: clientDecision === 'REJECT', fields: [{ name: 'comment', label: 'Comentário (opcional)', type: 'textarea' }] });
    if (result) this.act('client-decision', { clientDecision, comment: result['comment'] ?? '' });
  }
  protected readonly labels = { task: taskStatusLabels, request: requestStatusLabels };
}
