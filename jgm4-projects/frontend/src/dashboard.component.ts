import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardOverview, healthLabels, kindLabels, phaseTimelineLabels, projectStatusLabels, gateStatusLabels, alertLabels } from './dashboard.types';

type Filter = 'ALL' | 'ATENCAO' | 'CRITICO' | 'OVERDUE';

@Component({
  selector: 'app-dashboard', imports: [DatePipe, RouterLink],
  template: `<main class="dashboard">
    <div class="page-heading"><div><p class="eyebrow">DASHBOARD JGM4</p><h1>Carteira de projetos</h1><p class="lead">Visão gerencial dos projetos que você acompanha.</p></div></div>
    @if (loading()) { <section class="state-panel" aria-live="polite"><span class="loader"></span><h2>Carregando a carteira…</h2></section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Painel indisponível</h2><p>{{ error() }}</p></section> }
    @else if (data(); as data) {
      <section class="dash-cards" aria-label="Resumo da carteira">
        <button type="button" class="dash-card" [class.selected]="filter() === 'ALL'" (click)="setFilter('ALL')" data-testid="card-active"><p>Projetos ativos</p><strong>{{ data.cards.activeProjects }}</strong><small>planejamento ou em andamento</small></button>
        <button type="button" class="dash-card" [class.selected]="filter() === 'ATENCAO'" [class.warn]="data.cards.attention > 0" (click)="setFilter('ATENCAO')" data-testid="card-attention"><p>Em atenção</p><strong>{{ data.cards.attention }}</strong><small>filtrar projetos em atenção</small></button>
        <button type="button" class="dash-card" [class.selected]="filter() === 'CRITICO'" [class.warn]="data.cards.critical > 0" (click)="setFilter('CRITICO')" data-testid="card-critical"><p>Críticos</p><strong>{{ data.cards.critical }}</strong><small>filtrar projetos críticos</small></button>
        <a class="dash-card" routerLink="/approvals" data-testid="card-approvals"><p>Aprovações pendentes</p><strong>{{ data.cards.approvalsPending }}</strong><small>abrir a Central de Aprovações</small></a>
        <div class="dash-card static" data-testid="card-hours"><p>Horas registradas</p><strong>{{ data.cards.jgm4Hours + data.cards.clientHours }} h</strong><small>JGM4 {{ data.cards.jgm4Hours }} h · cliente {{ data.cards.clientHours }} h</small></div>
        <button type="button" class="dash-card" [class.selected]="filter() === 'OVERDUE'" [class.warn]="data.cards.overdue > 0" (click)="setFilter('OVERDUE')" data-testid="card-overdue"><p>Itens atrasados</p><strong>{{ data.cards.overdue }}</strong><small>filtrar projetos com atraso</small></button>
      </section>

      <div class="filter-tabs" role="group" aria-label="Filtrar projetos">
        @for (tab of tabs; track tab.id) { <button type="button" [class.selected]="filter() === tab.id" [attr.aria-pressed]="filter() === tab.id" (click)="setFilter(tab.id)">{{ tab.label }}</button> }
      </div>
      <p class="list-count" aria-live="polite">{{ visible().length }} {{ visible().length === 1 ? 'projeto' : 'projetos' }}</p>
      <div class="request-table-wrap"><table class="request-table stack-table" data-testid="project-table"><caption class="sr-only">Projetos autorizados</caption>
        <thead><tr><th>Cliente</th><th>Projeto</th><th>Fase</th><th>Progresso</th><th>Saúde</th><th>Gate</th><th>Próxima ação</th><th>Prazo</th><th>Consultor</th></tr></thead>
        <tbody>
        @for (p of visible(); track p.id) {
          <tr data-testid="project-row">
            <td data-label="Cliente">{{ p.company.name }}</td>
            <td data-label="Projeto"><a class="code-link" [routerLink]="['/projects', p.id, 'dashboard']">{{ p.name }}</a><small>{{ statusLabel(p.status) }}</small></td>
            <td data-label="Fase">{{ p.currentPhase ? 'Fase ' + p.currentPhase.order + ' — ' + p.currentPhase.name : '—' }}</td>
            <td data-label="Progresso"><div class="progress-line"><div class="bar"><span [style.width.%]="p.progress"></span></div><span>{{ p.progress }}%</span></div></td>
            <td data-label="Saúde"><a class="badge health" [class]="'health-' + p.health.level.toLowerCase()" [routerLink]="['/projects', p.id, 'dashboard']" fragment="atrasos" [title]="p.health.reasons.join(' ')">{{ health[p.health.level] }}</a>
              @if (p.health.reasons[0]; as reason) { <small>{{ reason }}</small> }</td>
            <td data-label="Gate">@if (p.gate) { <a [routerLink]="['/projects', p.id, 'gates', p.gate.id]">{{ p.gate.code }}</a><small>{{ gateLabel(p.gate.status) }} · {{ p.gate.percent }}%</small> } @else { — }</td>
            <td data-label="Próxima ação">@if (p.nextAction; as n) { <strong class="owner-label">{{ n.owner.label }}</strong><small>{{ n.code }} — {{ n.nextAction }}</small> } @else { — }</td>
            <td data-label="Prazo">{{ p.forecastEnd ? (p.forecastEnd | date:'dd/MM/yyyy':'UTC') : 'A definir' }}@if (p.overdue) { <small class="late-text">{{ p.overdue }} {{ p.overdue === 1 ? 'atrasado' : 'atrasados' }}</small> }</td>
            <td data-label="Consultor">{{ p.consultants.length ? p.consultants.join(', ') : '—' }}</td>
          </tr>
        } @empty { <tr><td colspan="9" class="empty-row">Nenhum projeto neste filtro.</td></tr> }
        </tbody></table></div>
      <p class="scope-note">Somente projetos autorizados ao seu perfil: administradores veem todos; consultores, apenas os vinculados. Saúde: normal, atenção ou crítico, com motivos no painel de cada projeto.</p>
    }
  </main>`,
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly destroyRef = inject(DestroyRef);
  readonly data = signal<DashboardOverview | null>(null); readonly loading = signal(true); readonly error = signal(''); readonly filter = signal<Filter>('ALL');
  readonly health = healthLabels; readonly kinds = kindLabels; readonly timeline = phaseTimelineLabels; readonly alert = alertLabels;
  readonly tabs: { id: Filter; label: string }[] = [{ id: 'ALL', label: 'Todos' }, { id: 'ATENCAO', label: 'Em atenção' }, { id: 'CRITICO', label: 'Críticos' }, { id: 'OVERDUE', label: 'Com atrasos' }];
  readonly visible = computed(() => {
    const data = this.data(); const filter = this.filter(); if (!data) return [];
    return data.projects.filter((p) => filter === 'ALL' || (filter === 'OVERDUE' ? p.overdue > 0 : p.health.level === filter));
  });
  ngOnInit() {
    this.http.get<DashboardOverview>('/api/dashboard').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => { this.data.set(data); this.loading.set(false); },
      error: (e: HttpErrorResponse) => { this.error.set(e.status === 403 ? 'Este painel é exclusivo da equipe JGM4. Use o painel do seu projeto.' : 'Não foi possível carregar a carteira. Verifique a API.'); this.loading.set(false); },
    });
  }
  setFilter(filter: Filter) { this.filter.set(this.filter() === filter && filter !== 'ALL' ? 'ALL' : filter); }
  statusLabel(status: string) { return projectStatusLabels[status] ?? status; }
  gateLabel(status: string) { return gateStatusLabels[status] ?? status; }
}
