import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, tap } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { ActionRow, ProjectDashboard, alertLabels, gateStatusLabels, healthLabels, itemLink, kindLabels, phaseTimelineLabels, projectStatusLabels, whenLabel } from './dashboard.types';

@Component({
  selector: 'app-project-dashboard', imports: [DatePipe, NgTemplateOutlet, RouterLink, ProjectNavComponent],
  template: `<main class="dashboard">
    @if (loading()) { <section class="state-panel" aria-live="polite"><span class="loader"></span><h2>Carregando o painel do projeto…</h2></section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Painel indisponível</h2><p>{{ error() }}</p></section> }
    @else if (d(); as d) {
      <app-project-nav [projectId]="d.project.id" />
      <header class="dash-header">
        <div><p class="eyebrow">{{ d.project.company.name.toUpperCase() }}</p><h1 data-testid="dash-title">{{ d.project.name }}</h1>
          <div class="dash-badges"><span class="badge" data-testid="dash-status">{{ statusLabel(d.project.status) }}</span>
            <span class="badge health" [class]="'health-' + d.health.level.toLowerCase()" data-testid="dash-health">Saúde: {{ health[d.health.level] }}</span></div></div>
        <dl class="dash-facts">
          <div><dt>Fase atual</dt><dd data-testid="dash-phase">{{ d.currentPhase ? 'Fase ' + d.currentPhase.order + ' — ' + d.currentPhase.name : '—' }}</dd></div>
          <div><dt>Gate atual</dt><dd>@if (d.gate) { <a [routerLink]="['/projects', d.project.id, 'gates', d.gate.id]">{{ d.gate.title }}</a> } @else { — }</dd></div>
          <div><dt>Início</dt><dd>{{ d.schedule.startDate ? (d.schedule.startDate | date:'dd/MM/yyyy':'UTC') : 'A definir' }}</dd></div>
          <div><dt>Previsão de término</dt><dd>{{ d.schedule.forecastEnd ? (d.schedule.forecastEnd | date:'dd/MM/yyyy':'UTC') : 'A definir' }}</dd></div>
          <div><dt>Consultor JGM4</dt><dd>{{ names(d.project.consultants) }}</dd></div>
          <div><dt>Gestor do cliente</dt><dd>{{ names(d.project.clientManagers) }}</dd></div>
          <div><dt>Patrocinador</dt><dd>{{ names(d.project.sponsors) }}</dd></div>
        </dl>
      </header>
      <div class="progress-line" data-testid="dash-progress-line"><div class="bar big"><span [style.width.%]="d.progress.percent"></span></div><strong>{{ d.progress.percent }}% concluído</strong></div>

      <section class="dash-cards" aria-label="Indicadores principais">
        <a class="dash-card" routerLink="." fragment="fases" data-testid="dash-progress"><p>Progresso</p><strong>{{ d.progress.percent }}%</strong><small>{{ d.progress.completed }} de {{ d.progress.total }} atividades concluídas</small></a>
        <a class="dash-card" [class.warn]="d.hours.jgm4.alert !== 'NORMAL'" routerLink="." fragment="horas" data-testid="dash-hours-jgm4"><p>Horas JGM4</p><strong>{{ d.hours.jgm4.actual }} h</strong>
          <small>Planejado {{ d.hours.jgm4.planned }} h · Saldo {{ d.hours.jgm4.remaining }} h · Consumo {{ d.hours.jgm4.percent }}%</small>@if (alert[d.hours.jgm4.alert]) { <span class="alert-tag">{{ alert[d.hours.jgm4.alert] }}</span> }</a>
        <a class="dash-card" routerLink="." fragment="horas" data-testid="dash-hours-client"><p>Horas {{ d.project.company.name.split(' ')[0] }}</p><strong>{{ d.hours.client.actual }} h</strong>
          <small>Planejado {{ d.hours.client.planned }} h · Saldo {{ d.hours.client.remaining }} h · Consumo {{ d.hours.client.percent }}%</small></a>
        <a class="dash-card" routerLink="." fragment="proximas" data-testid="dash-pending"><p>Pendências</p><strong>{{ d.pending.count }}</strong><small>itens com alguém para agir agora</small></a>
        <a class="dash-card" [class.warn]="d.delays.count > 0" routerLink="." fragment="atrasos" data-testid="dash-overdue"><p>Atrasados</p><strong>{{ d.delays.count }}</strong><small>{{ d.delays.count === 1 ? 'item' : 'itens' }} com prazo vencido</small></a>
        <a class="dash-card" routerLink="/approvals" [queryParams]="{ projectId: d.project.id }" data-testid="dash-approvals"><p>Aprovações</p><strong>{{ d.approvals.pending }}</strong><small>aguardando decisão · {{ d.approvals.high }} de alta prioridade</small></a>
      </section>

      <section class="panel" data-testid="dash-health-block"><div class="section-heading"><div><p class="eyebrow">SAÚDE DO PROJETO</p><h2>{{ health[d.health.level] }}</h2></div></div>
        @if (d.health.reasons.length) { <p>Motivos:</p><ul class="plain-list">@for (reason of d.health.reasons; track reason) { <li>{{ reason }}</li> }</ul> } @else { <p class="muted-copy">Nenhuma condição de atenção: sem itens atrasados, horas dentro do planejado e Gates sem correção.</p> }
        <p class="muted-copy">Regras: crítico = projeto em espera, horas JGM4 acima de 100%, 3 ou mais itens atrasados ou Gate rejeitado; atenção = horas JGM4 a partir de 80%, 1–2 itens atrasados ou Gate em correção.</p></section>

      <section class="panel" id="fases" aria-label="Fases">
        <div class="section-heading"><div><p class="eyebrow">LINHA DO TEMPO</p><h2>Fases do projeto</h2></div></div>
        <ol class="timeline" data-testid="dash-timeline">@for (phase of d.phases; track phase.id) { <li [class]="'tl-' + phase.status.toLowerCase()"><span class="tl-dot" aria-hidden="true">{{ phase.status === 'COMPLETED' ? '✓' : phase.order }}</span><strong>Fase {{ phase.order }}</strong><small>{{ timeline[phase.status] || phase.status }}</small></li> }</ol>
        @for (phase of d.phases; track phase.id) {
          <article class="phase-progress" data-testid="dash-phase-row">
            <div class="pp-head"><strong>Fase {{ phase.order }} — {{ phase.name }}</strong><span class="badge">{{ timeline[phase.status] || phase.status }}</span></div>
            <div class="progress-line"><div class="bar"><span [style.width.%]="phase.percent"></span></div><span>{{ phase.percent }}% · {{ phase.completed }}/{{ phase.total }} atividades</span></div>
            <p class="pp-meta">JGM4 {{ phase.jgm4.actual }} h de {{ phase.jgm4.planned }} h ({{ phase.jgm4.percent }}%)@if (alert[phase.jgm4.alert]) { <span class="alert-tag">{{ alert[phase.jgm4.alert] }}</span> } · {{ d.project.company.name.split(' ')[0] }} {{ phase.client.actual }} h de {{ phase.client.planned }} h
              @if (phase.gate) { · <a [routerLink]="['/projects', d.project.id, 'gates', phase.gate.id]">{{ phase.gate.code }}: {{ gateLabel(phase.gate.status) }}</a> }</p>
          </article>
        }
      </section>

      <section class="panel" id="horas" aria-label="Horas">
        <div class="section-heading"><div><p class="eyebrow">ESFORÇO</p><h2>Horas planejadas e realizadas</h2></div><span>Fonte: apontamentos de horas</span></div>
        <div class="hours-grid">
          @for (item of hourBlocks(d); track item.label) {
            <div class="hours-box" [class.warn]="item.block.alert !== 'NORMAL'"><p>{{ item.label }}</p>
              <div class="bar"><span [style.width.%]="min(item.block.percent)" [class.over]="item.block.alert === 'EXCEDIDO'"></span></div>
              <strong>{{ item.block.actual }} h de {{ item.block.planned }} h · {{ item.block.percent }}%</strong><small>Saldo {{ item.block.remaining }} h @if (alert[item.block.alert]) { <span class="alert-tag">{{ alert[item.block.alert] }}</span> }</small></div>
          }
        </div>
        <p class="muted-copy">Horas medem esforço; nenhum valor financeiro é calculado.</p>
      </section>

      <div class="dash-columns">
        <section class="panel" aria-label="Gate atual" data-testid="dash-gate">
          <p class="eyebrow">GATE ATUAL</p>
          @if (d.gate; as g) {
            <h2><a [routerLink]="['/projects', d.project.id, 'gates', g.id]">Gate {{ g.phaseOrder }} — {{ g.title }}</a></h2>
            <span class="badge">{{ gateLabel(g.status) }}</span>
            <div class="progress-line"><div class="bar"><span [style.width.%]="g.percent"></span></div><span>{{ g.satisfied }}/{{ g.total }} critérios · {{ g.percent }}%</span></div>
            <p><strong>Responsável:</strong> {{ g.owner }}</p><p><strong>Próxima ação:</strong> {{ g.nextAction }}</p>
          } @else { <p class="muted-copy">Nenhum Gate pendente.</p> }
        </section>
        <section class="panel" aria-label="Prazo"><p class="eyebrow">PRAZO</p>
          <h2>{{ d.schedule.plannedWeeks }} semanas planejadas</h2>
          <p>Decorridas: <strong>{{ d.schedule.started ? d.schedule.elapsedWeeks : 0 }}</strong> · Restantes: <strong>{{ d.schedule.remainingWeeks }}</strong>@if (!d.schedule.started) { <small class="muted-copy"> (projeto ainda não iniciado)</small> }</p>
          <p>Previsão de término: <strong>{{ d.schedule.forecastEnd ? (d.schedule.forecastEnd | date:'dd/MM/yyyy':'UTC') : 'a definir' }}</strong></p>
          <p class="muted-copy">O prazo é só referência: o progresso é calculado por atividades concluídas, nunca pelo tempo.</p></section>
      </div>

      <section class="panel" id="proximas" aria-label="Próximas ações" data-testid="dash-next-actions">
        <div class="section-heading"><div><p class="eyebrow">QUEM ESTÁ COM A BOLA</p><h2>Próximas ações</h2></div><span>até 10 itens priorizados</span></div>
        @for (item of d.nextActions; track item.kind + item.entityId + (item.approvalId || '')) { <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ item: item, projectId: d.project.id }" /> } @empty { <p class="muted-copy">Nada pendente no momento.</p> }
      </section>

      <section class="panel" aria-label="Minha fila" data-testid="dash-my-queue">
        <div class="section-heading"><div><p class="eyebrow">MINHA FILA</p><h2>{{ d.myQueue.count === 0 ? 'Você não tem pendências' : d.myQueue.count === 1 ? 'Você tem 1 pendência' : 'Você tem ' + d.myQueue.count + ' pendências' }}</h2></div></div>
        <ul class="plain-list">@for (item of d.myQueue.items; track item.kind + item.entityId + (item.approvalId || '')) { <li><a [routerLink]="link(d.project.id, item)">{{ item.code }}</a> — {{ item.nextAction }}</li> }</ul>
      </section>

      @if (d.criticalPending.length) {
        <section class="panel" aria-label="Pendências críticas" data-testid="dash-critical"><div class="section-heading"><div><p class="eyebrow">ALTA PRIORIDADE</p><h2>Pendências críticas</h2></div></div>
          @for (item of d.criticalPending; track item.kind + item.entityId + (item.approvalId || '')) { <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ item: item, projectId: d.project.id }" /> }</section>
      }

      <section class="panel" id="atrasos" aria-label="Itens atrasados" data-testid="dash-delays">
        <div class="section-heading"><div><p class="eyebrow">ATRASOS</p><h2>{{ d.delays.count }} {{ d.delays.count === 1 ? 'item atrasado' : 'itens atrasados' }}</h2></div></div>
        @for (item of d.delays.items; track item.kind + item.entityId + (item.approvalId || '')) { <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ item: item, projectId: d.project.id }" /> } @empty { <p class="muted-copy">Nenhum item atrasado. Fases bloqueadas e atividades aguardando dependência não contam como atraso.</p> }
      </section>

      <div class="dash-columns">
        <section class="panel" aria-label="Solicitações" data-testid="dash-requests"><p class="eyebrow">SOLICITAÇÕES</p>
          <dl class="count-list"><div><dt>Planejadas</dt><dd>{{ d.requests['planned'] }}</dd></div><div><dt>Disponíveis</dt><dd>{{ d.requests['available'] }}</dd></div><div><dt>Aguardando cliente</dt><dd>{{ d.requests['waitingClient'] }}</dd></div>
            <div><dt>Aguardando JGM4</dt><dd>{{ d.requests['waitingJgm4'] }}</dd></div><div><dt>Ajustes solicitados</dt><dd>{{ d.requests['adjustment'] }}</dd></div><div><dt>Aceitas</dt><dd>{{ d.requests['accepted'] }}</dd></div><div><dt>Atrasadas</dt><dd>{{ d.requests['overdue'] }}</dd></div></dl>
          <a [routerLink]="['/projects', d.project.id, 'requests']">Abrir solicitações →</a></section>
        <section class="panel" aria-label="Atividades" data-testid="dash-tasks"><p class="eyebrow">ATIVIDADES</p>
          <dl class="count-list"><div><dt>Não iniciadas</dt><dd>{{ d.tasks['notStarted'] }}</dd></div><div><dt>Liberadas</dt><dd>{{ d.tasks['released'] }}</dd></div><div><dt>Em andamento</dt><dd>{{ d.tasks['inProgress'] }}</dd></div>
            <div><dt>Aguardando evidência</dt><dd>{{ d.tasks['waitingEvidence'] }}</dd></div><div><dt>Aguardando JGM4</dt><dd>{{ d.tasks['waitingJgm4'] }}</dd></div><div><dt>Ajustes</dt><dd>{{ d.tasks['adjustment'] }}</dd></div>
            <div><dt>Concluídas</dt><dd>{{ d.tasks['completed'] }}</dd></div><div><dt>Bloqueadas</dt><dd>{{ d.tasks['blocked'] }}</dd></div></dl>
          <a [routerLink]="['/projects', d.project.id, 'plan']">Abrir plano →</a></section>
      </div>

      <section class="panel" aria-label="Últimas movimentações" data-testid="dash-recent">
        <div class="section-heading"><div><p class="eyebrow">AUDITORIA</p><h2>Últimas movimentações</h2></div><span>até 10 registros</span></div>
        <ol class="history-list">@for (event of d.recentActivity; track event.id) { <li><div><strong>{{ event.text }}</strong><span>{{ when(event.at) }}</span></div></li> } @empty { <li class="muted-copy">Nenhuma movimentação registrada.</li> }</ol>
      </section>

      <ng-template #row let-item="item" let-projectId="projectId">
        <article class="action-row" [class.late]="item.daysLate > 0" data-testid="dash-action-row">
          <div class="ar-main"><span class="badge">{{ kinds[item.kind] }}</span> <a class="code-link" [routerLink]="link(projectId, item)">{{ item.code }}</a> <span class="ar-title">{{ item.title.startsWith(item.code) ? item.title.slice(item.code.length).replace(/^s*[—-]s*/, '') : item.title }}</span></div>
          <div class="ar-owner"><strong>{{ item.owner.label }}</strong><small>{{ item.nextAction }}</small></div>
          <div class="ar-due">@if (item.dueDate) { <span>Prazo {{ item.dueDate | date:'dd/MM':'UTC' }}</span> } @else { <span>Sem prazo</span> }@if (item.daysLate > 0) { <small class="late-text">{{ item.daysLate }} {{ item.daysLate === 1 ? 'dia' : 'dias' }} de atraso</small> }</div>
        </article>
      </ng-template>
    }
  </main>`,
})
export class ProjectDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  readonly d = signal<ProjectDashboard | null>(null); readonly loading = signal(true); readonly error = signal('');
  readonly health = healthLabels; readonly alert = alertLabels; readonly timeline = phaseTimelineLabels; readonly kinds = kindLabels;
  ngOnInit() {
    this.route.paramMap.pipe(tap(() => { this.loading.set(true); this.error.set(''); }), switchMap((params) => this.http.get<ProjectDashboard>(`/api/projects/${encodeURIComponent(params.get('id') ?? '')}/dashboard`).pipe(
      catchError((e: HttpErrorResponse) => { this.error.set(e.status === 403 ? 'Você não tem acesso a este projeto.' : e.status === 404 ? 'Projeto não encontrado.' : 'Não foi possível carregar o painel. Verifique a API.'); this.loading.set(false); return EMPTY; }))),
    takeUntilDestroyed(this.destroyRef)).subscribe((dashboard) => { this.d.set(dashboard); this.loading.set(false); });
  }
  statusLabel(status: string) { return projectStatusLabels[status] ?? status; }
  gateLabel(status: string) { return gateStatusLabels[status] ?? status; }
  names(list: string[]) { return list.length ? list.join(', ') : 'A definir'; }
  min(value: number) { return Math.min(value, 100); }
  link(projectId: string, item: ActionRow) { return itemLink(projectId, item); }
  when(value: string) { return whenLabel(value); }
  hourBlocks(d: ProjectDashboard) { return [{ label: 'Horas JGM4', block: d.hours.jgm4 }, { label: `Horas ${d.project.company.name.split(' ')[0]}`, block: d.hours.client }]; }
}
