import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, tap } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { ActionRow, ProjectDashboard, itemLink, whenLabel } from './dashboard.types';
import { alertLabels, gateStatusLabels, healthLabels, kindLabels, phaseStatusLabels, projectStatusLabels, toneOf } from './ui/labels';
import { UI } from './ui/ui.components';

// Painel do projeto: resumo executivo no topo (cliente, projeto, fase, status, progresso, Gate e próxima ação) e detalhes em ordem de importância.
@Component({
  selector: 'app-project-dashboard', imports: [NgTemplateOutlet, RouterLink, ProjectNavComponent, ...UI],
  template: `<main class="dashboard">
    @if (loading()) { <ui-loading message="Carregando o painel do projeto…" /> }
    @else if (error()) { <ui-alert tone="danger" title="Painel indisponível">{{ error() }}</ui-alert> }
    @else if (d(); as d) {
      <app-project-nav [projectId]="d.project.id" />

      <section class="exec-summary" aria-label="Resumo executivo">
        <div class="exec-main">
          <p class="eyebrow">{{ d.project.company.name }}</p>
          <h1 data-testid="dash-title">{{ d.project.name }}</h1>
          <div class="dash-badges"><span class="badge" [class]="'badge badge-' + statusTone(d.project.status)" data-testid="dash-status">{{ statusLabel(d.project.status) }}</span>
            <span class="badge health" [class]="'badge health health-' + d.health.level.toLowerCase()" data-testid="dash-health">Saúde: {{ health[d.health.level] }}</span></div>
          <div class="progress-line" data-testid="dash-progress-line"><div class="bar big" role="progressbar" [attr.aria-valuenow]="d.progress.percent" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do projeto"><span [style.width.%]="d.progress.percent"></span></div><strong>{{ d.progress.percent }}% concluído</strong></div>
        </div>
        <dl class="exec-facts">
          <div><dt>Fase atual</dt><dd data-testid="dash-phase">{{ d.currentPhase ? 'Fase ' + d.currentPhase.order + ' — ' + d.currentPhase.name : '—' }}</dd></div>
          <div><dt>Gate atual</dt><dd>@if (d.gate) { <a [routerLink]="['/projects', d.project.id, 'gates', d.gate.id]">{{ d.gate.title }}</a> } @else { — }</dd></div>
          <div><dt>Previsão de término</dt><dd>{{ d.schedule.forecastEnd | fmtDate:'A definir' }}</dd></div>
          <div><dt>Início</dt><dd>{{ d.schedule.startDate | fmtDate:'A definir' }}</dd></div>
        </dl>
        <div class="next-step" data-testid="dash-top-action">
          <p class="eyebrow">PRÓXIMA AÇÃO</p>
          @if (d.topAction; as a) { <p><strong>{{ a.owner.label }}:</strong> {{ a.nextAction }}</p><a class="btn secondary" [routerLink]="link(d.project.id, a)">Abrir {{ a.code }}</a> }
          @else { <p class="text-muted">Nada pendente no momento.</p> }
        </div>
        <p class="exec-team">Consultor JGM4: <strong>{{ names(d.project.consultants) }}</strong> · Gestor do cliente: <strong>{{ names(d.project.clientManagers) }}</strong> · Patrocinador: <strong>{{ names(d.project.sponsors) }}</strong></p>
      </section>

      <section class="panel" data-testid="dash-external-dependencies"><h2>Dependências externas</h2><p>{{ d.externalDependencies?.length ?? 0 }} em andamento</p><ul>@for (dependency of d.externalDependencies ?? []; track dependency.id) { <li>{{ dependency.description }} · {{ dependency.responsible }} · {{ dependency.blocksProject ? 'Bloqueia o projeto' : dependency.blocksTask ? 'Bloqueia atividade vinculada' : 'Atividades independentes continuam' }}</li> }</ul><p>Dependência física em andamento — projeto continua nas atividades independentes.</p><a [routerLink]="['/projects', d.project.id, 'proposal']" fragment="dependencias">Acompanhar dependências externas</a></section>
      <section class="dash-cards" aria-label="Indicadores principais">
        <a class="dash-card primary" routerLink="." fragment="fases" data-testid="dash-progress"><p>Progresso</p><strong>{{ d.progress.percent }}%</strong><small>{{ d.progress.completed }} de {{ d.progress.total }} atividades concluídas</small></a>
        <a class="dash-card" [class.warn]="d.hours.jgm4.alert !== 'NORMAL'" routerLink="." fragment="horas" data-testid="dash-hours-jgm4"><p>Horas JGM4</p><strong>{{ d.hours.jgm4.actual }} h</strong>
          <small>Planejado {{ d.hours.jgm4.planned }} h · saldo {{ d.hours.jgm4.remaining }} h · {{ d.hours.jgm4.percent }}% consumido</small>@if (alert[d.hours.jgm4.alert]) { <span class="alert-tag">{{ alert[d.hours.jgm4.alert] }}</span> }</a>
        <a class="dash-card" routerLink="." fragment="horas" data-testid="dash-hours-client"><p>Horas {{ d.project.company.name.split(' ')[0] }}</p><strong>{{ d.hours.client.actual }} h</strong>
          <small>Planejado {{ d.hours.client.planned }} h · saldo {{ d.hours.client.remaining }} h · {{ d.hours.client.percent }}% consumido</small></a>
        <a class="dash-card primary" routerLink="." fragment="proximas" data-testid="dash-pending"><p>Pendências</p><strong>{{ d.pending.count }}</strong><small>itens com alguém para agir agora</small></a>
        <a class="dash-card primary" [class.danger]="d.delays.count > 0" routerLink="." fragment="atrasos" data-testid="dash-overdue"><p>Atrasados</p><strong>{{ d.delays.count }}</strong><small>{{ d.delays.count === 1 ? 'item' : 'itens' }} com prazo vencido</small></a>
        <a class="dash-card" routerLink="/approvals" [queryParams]="{ projectId: d.project.id }" data-testid="dash-approvals"><p>Aprovações</p><strong>{{ d.approvals.pending }}</strong><small>aguardando decisão · {{ d.approvals.high }} de alta prioridade</small></a>
      </section>

      <section class="panel health-panel" [class]="'panel health-panel health-border-' + d.health.level.toLowerCase()" data-testid="dash-health-block">
        <ui-section-header eyebrow="SAÚDE DO PROJETO" [title]="health[d.health.level]" />
        @if (d.health.reasons.length) { <p>Motivos:</p><ul class="plain-list">@for (reason of d.health.reasons; track reason) { <li>{{ reason }}</li> }</ul> } @else { <p class="muted-copy">Nenhuma condição de atenção: sem itens atrasados, horas dentro do planejado e Gates sem correção.</p> }
        <details class="rules"><summary>Como a saúde é calculada</summary><p class="muted-copy">Crítico = projeto em espera, horas JGM4 acima de 100%, 3 ou mais itens atrasados ou Gate rejeitado. Atenção = horas JGM4 a partir de 80%, 1–2 itens atrasados ou Gate em correção.</p></details>
      </section>

      <section class="panel" id="fases" aria-label="Fases">
        <ui-section-header eyebrow="LINHA DO TEMPO" title="Fases e Gates" />
        <ol class="phase-stepper" data-testid="dash-timeline">@for (phase of d.phases; track phase.id) {
          <li [class]="'tl-' + phase.status.toLowerCase()"><span class="tl-dot" aria-hidden="true">{{ phase.status === 'COMPLETED' ? '✓' : phase.order }}</span><strong>Fase {{ phase.order }}</strong><span class="tl-name">{{ phase.name }}</span><small>{{ phaseState(phase.status) }}</small>
            @if (phase.gate) { <a class="tl-gate" [class]="'tl-gate gate-chip-' + gateTone(phase.gate.status)" [routerLink]="['/projects', d.project.id, 'gates', phase.gate.id]" [attr.title]="gateLabel(phase.gate.status)">◆ {{ phase.gate.code.replace('GATE-', 'Gate ') }}: {{ gateLabel(phase.gate.status) }}</a> }</li> }</ol>
        @for (phase of d.phases; track phase.id) {
          <article class="phase-progress" data-testid="dash-phase-row">
            <div class="pp-head"><strong>Fase {{ phase.order }} — {{ phase.name }}</strong><ui-badge [tone]="phaseTone(phase.status)" [label]="phaseState(phase.status)" /></div>
            <div class="progress-line"><div class="bar"><span [style.width.%]="phase.percent"></span></div><span>{{ phase.percent }}% · {{ phase.completed }}/{{ phase.total }} atividades</span></div>
            <p class="pp-meta">JGM4 {{ phase.jgm4.actual }} h de {{ phase.jgm4.planned }} h ({{ phase.jgm4.percent }}%)@if (alert[phase.jgm4.alert]) { <span class="alert-tag">{{ alert[phase.jgm4.alert] }}</span> } · {{ d.project.company.name.split(' ')[0] }} {{ phase.client.actual }} h de {{ phase.client.planned }} h</p>
          </article>
        }
      </section>

      <section class="panel" id="horas" aria-label="Horas">
        <ui-section-header eyebrow="ESFORÇO" title="Horas planejadas e realizadas"><span>Fonte: apontamentos de horas</span></ui-section-header>
        <div class="hours-grid">
          @for (item of hourBlocks(d); track item.label) {
            <div class="hours-box" [class.warn]="item.block.alert !== 'NORMAL'"><p>{{ item.label }}</p>
              <div class="hours-figures"><div><small>Planejado</small><strong>{{ item.block.planned }} h</strong></div><div><small>Realizado</small><strong>{{ item.block.actual }} h</strong></div><div><small>Saldo</small><strong>{{ item.block.remaining }} h</strong></div><div><small>Consumo</small><strong>{{ item.block.percent }}%</strong></div></div>
              <div class="bar" role="progressbar" [attr.aria-valuenow]="min(item.block.percent)" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Consumo — ' + item.label"><span [style.width.%]="min(item.block.percent)" [class.over]="item.block.alert === 'EXCEDIDO'"></span></div>
              @if (alert[item.block.alert]) { <span class="alert-tag">{{ alert[item.block.alert] }}</span> }</div>
          }
        </div>
        <p class="muted-copy">Horas medem esforço; nenhum valor financeiro é calculado.</p>
      </section>

      <div class="dash-columns">
        <section class="panel" aria-label="Gate atual" data-testid="dash-gate">
          <p class="eyebrow">GATE ATUAL</p>
          @if (d.gate; as g) {
            <h2><a [routerLink]="['/projects', d.project.id, 'gates', g.id]">Gate {{ g.phaseOrder }} — {{ g.title }}</a></h2>
            <ui-badge [status]="g.status" domain="gate" />
            <div class="progress-line"><div class="bar"><span [style.width.%]="g.percent"></span></div><span>{{ g.satisfied }}/{{ g.total }} critérios · {{ g.percent }}%</span></div>
            <p><strong>Responsável:</strong> {{ g.owner }}</p><p><strong>Próxima ação:</strong> {{ g.nextAction }}</p>
          } @else { <p class="muted-copy">Nenhum Gate pendente.</p> }
        </section>
        <section class="panel" aria-label="Prazo"><p class="eyebrow">PRAZO</p>
          <h2>{{ d.schedule.plannedWeeks }} semanas planejadas</h2>
          <p>Decorridas: <strong>{{ d.schedule.started ? d.schedule.elapsedWeeks : 0 }}</strong> · Restantes: <strong>{{ d.schedule.remainingWeeks }}</strong>@if (!d.schedule.started) { <small class="muted-copy"> (projeto ainda não iniciado)</small> }</p>
          <p>Previsão de término: <strong>{{ d.schedule.forecastEnd | fmtDate:'a definir' }}</strong></p>
          <p class="muted-copy">O prazo é só referência: o progresso é calculado por atividades concluídas, nunca pelo tempo.</p></section>
      </div>

      <section class="panel" id="proximas" aria-label="Próximas ações" data-testid="dash-next-actions">
        <ui-section-header eyebrow="QUEM ESTÁ COM A BOLA" title="Próximas ações"><span>até 10 itens priorizados</span></ui-section-header>
        @for (item of d.nextActions; track item.kind + item.entityId + (item.approvalId || '')) { <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ item: item, projectId: d.project.id }" /> } @empty { <p class="muted-copy">Nada pendente no momento.</p> }
      </section>

      <section class="panel" aria-label="Minha fila" data-testid="dash-my-queue">
        <ui-section-header eyebrow="MINHA FILA" [title]="d.myQueue.count === 0 ? 'Você não tem pendências' : d.myQueue.count === 1 ? 'Você tem 1 pendência' : 'Você tem ' + d.myQueue.count + ' pendências'" />
        <ul class="plain-list">@for (item of d.myQueue.items; track item.kind + item.entityId + (item.approvalId || '')) { <li><a [routerLink]="link(d.project.id, item)">{{ item.code }}</a> — {{ item.nextAction }}</li> }</ul>
      </section>

      @if (d.criticalPending.length) {
        <section class="panel" aria-label="Pendências críticas" data-testid="dash-critical"><ui-section-header eyebrow="ALTA PRIORIDADE" title="Pendências críticas" />
          @for (item of d.criticalPending; track item.kind + item.entityId + (item.approvalId || '')) { <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ item: item, projectId: d.project.id }" /> }</section>
      }

      <section class="panel" id="atrasos" aria-label="Itens atrasados" data-testid="dash-delays">
        <ui-section-header eyebrow="ATRASOS" [title]="d.delays.count + ' ' + (d.delays.count === 1 ? 'item atrasado' : 'itens atrasados')" />
        @for (item of d.delays.items; track item.kind + item.entityId + (item.approvalId || '')) { <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ item: item, projectId: d.project.id }" /> } @empty { <p class="muted-copy">Nenhum item atrasado. Fases bloqueadas e atividades aguardando dependência não contam como atraso.</p> }
      </section>

      <div class="dash-columns">
        <section class="panel" aria-label="Solicitações" data-testid="dash-requests"><p class="eyebrow">SOLICITAÇÕES</p>
          <dl class="count-list"><div><dt>Planejadas</dt><dd>{{ d.requests['planned'] }}</dd></div><div><dt>Disponíveis</dt><dd>{{ d.requests['available'] }}</dd></div><div><dt>Aguardando cliente</dt><dd>{{ d.requests['waitingClient'] }}</dd></div>
            <div><dt>Aguardando JGM4</dt><dd>{{ d.requests['waitingJgm4'] }}</dd></div><div><dt>Ajustes solicitados</dt><dd>{{ d.requests['adjustment'] }}</dd></div><div><dt>Aceitas</dt><dd>{{ d.requests['accepted'] }}</dd></div><div><dt>Atrasadas</dt><dd>{{ d.requests['overdue'] }}</dd></div></dl>
          <a class="small-link" [routerLink]="['/projects', d.project.id, 'requests']">Abrir solicitações →</a></section>
        <section class="panel" aria-label="Atividades" data-testid="dash-tasks"><p class="eyebrow">ATIVIDADES</p>
          <dl class="count-list"><div><dt>Não iniciadas</dt><dd>{{ d.tasks['notStarted'] }}</dd></div><div><dt>Liberadas</dt><dd>{{ d.tasks['released'] }}</dd></div><div><dt>Em andamento</dt><dd>{{ d.tasks['inProgress'] }}</dd></div>
            <div><dt>Aguardando evidência</dt><dd>{{ d.tasks['waitingEvidence'] }}</dd></div><div><dt>Aguardando JGM4</dt><dd>{{ d.tasks['waitingJgm4'] }}</dd></div><div><dt>Ajustes</dt><dd>{{ d.tasks['adjustment'] }}</dd></div>
            <div><dt>Concluídas</dt><dd>{{ d.tasks['completed'] }}</dd></div><div><dt>Bloqueadas</dt><dd>{{ d.tasks['blocked'] }}</dd></div></dl>
          <a class="small-link" [routerLink]="['/projects', d.project.id, 'plan']">Abrir plano →</a></section>
      </div>

      <section class="panel" aria-label="Últimas movimentações" data-testid="dash-recent">
        <ui-section-header eyebrow="AUDITORIA" title="Últimas movimentações"><span>até 10 registros</span></ui-section-header>
        <ol class="history-list">@for (event of d.recentActivity; track event.id) { <li><div><strong>{{ event.text }}</strong><span>{{ when(event.at) }}</span></div></li> } @empty { <li class="muted-copy">Nenhuma movimentação registrada.</li> }</ol>
      </section>

      <ng-template #row let-item="item" let-projectId="projectId">
        <article class="action-row" [class.late]="item.daysLate > 0" data-testid="dash-action-row">
          <div class="ar-main"><span class="badge badge-neutral">{{ kinds[item.kind] }}</span> <a class="code-link" [routerLink]="link(projectId, item)">{{ item.code }}</a> <span class="ar-title">{{ item.title.startsWith(item.code) ? item.title.slice(item.code.length).replace(/^\\s*[—-]\\s*/, '') : item.title }}</span></div>
          <div class="ar-owner"><strong>{{ item.owner.label }}</strong><small>{{ item.nextAction }}</small></div>
          <div class="ar-due">@if (item.dueDate) { <span>Prazo {{ item.dueDate | fmtDate }}</span> } @else { <span>Sem prazo</span> }@if (item.daysLate > 0) { <small class="late-text">{{ item.daysLate }} {{ item.daysLate === 1 ? 'dia' : 'dias' }} de atraso</small> }</div>
        </article>
      </ng-template>
    }
  </main>`,
})
export class ProjectDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  readonly d = signal<ProjectDashboard | null>(null); readonly loading = signal(true); readonly error = signal('');
  readonly health = healthLabels; readonly alert = alertLabels; readonly kinds = kindLabels;
  ngOnInit() {
    this.route.paramMap.pipe(tap(() => { this.loading.set(true); this.error.set(''); }), switchMap((params) => this.http.get<ProjectDashboard>(`/api/projects/${encodeURIComponent(params.get('id') ?? '')}/dashboard`).pipe(
      catchError((e: HttpErrorResponse) => { this.error.set(e.status === 403 ? 'Você não tem acesso a este projeto.' : e.status === 404 ? 'Projeto não encontrado.' : 'Não foi possível carregar o painel. Verifique sua conexão e tente novamente.'); this.loading.set(false); return EMPTY; }))),
    takeUntilDestroyed(this.destroyRef)).subscribe((dashboard) => { this.d.set(dashboard); this.loading.set(false); });
  }
  statusLabel(status: string) { return projectStatusLabels[status] ?? status; }
  statusTone(status: string) { return toneOf(status); }
  gateLabel(status: string) { return gateStatusLabels[status] ?? status; }
  gateTone(status: string) { return { APPROVED: 'success', CLOSED: 'success', REJECTED: 'danger', CORRECTION_REQUIRED: 'danger', UNDER_REVIEW: 'warning', TECHNICALLY_APPROVED: 'warning', AVAILABLE: 'info' }[status] ?? 'neutral'; }
  phaseState(status: string) { return phaseStatusLabels[status] ?? status; }
  phaseTone(status: string) { return toneOf(status === 'AVAILABLE' ? 'IN_PROGRESS' : status); }
  names(list: string[]) { return list.length ? list.join(', ') : 'A definir'; }
  min(value: number) { return Math.min(value, 100); }
  link(projectId: string, item: ActionRow) { return itemLink(projectId, item); }
  when(value: string) { return whenLabel(value); }
  hourBlocks(d: ProjectDashboard) { return [{ label: 'Horas JGM4', block: d.hours.jgm4 }, { label: `Horas ${d.project.company.name.split(' ')[0]}`, block: d.hours.client }]; }
}
