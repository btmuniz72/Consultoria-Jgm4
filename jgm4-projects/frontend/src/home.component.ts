import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, switchMap } from 'rxjs';
import { Project, ProjectListItem } from './project.types';
import { ProjectRequest } from './request.types';

@Component({
  selector: 'app-home', imports: [RouterLink],
  template: `<main>
    <div class="page-heading"><div><p class="eyebrow">JGM4 PROJECTS</p><h1>Central de projetos</h1><p class="lead">Planeje as fases, acompanhe solicitações e prepare os alinhamentos.</p></div><span class="badge">Visão JGM4 · ambiente local</span></div>
    @if (loading()) { <section class="state-panel" aria-live="polite">Carregando projetos…</section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Consulta indisponível</h2><p>{{ error() }}</p><button (click)="retry()">Tentar novamente</button></section> }
    @else {
      <section class="metrics" aria-label="Resumo da carteira">
        <article><p>Clientes</p><div><strong>{{ companyCount() }}</strong></div><small>Com projetos nesta consulta</small></article>
        <article><p>Projetos</p><div><strong>{{ projects().length }}</strong></div><small>Disponíveis para acompanhamento</small></article>
        <article><p>Solicitações</p><div><strong>{{ requestCount() }}</strong></div><small>Fila completa, incluindo futuras</small></article>
        <article><p>Aguardando JGM4</p><div><strong>{{ reviewCount() }}</strong></div><small>Respostas recebidas e em análise</small></article>
      </section>
      @for (entry of projects(); track entry.plan.id) {
        <section class="panel home-project" data-testid="home-project">
          <p class="eyebrow">{{ entry.plan.company.name }}</p><h2>{{ entry.plan.name }}</h2><p class="lead">Plano C · {{ entry.plan.summary.phaseCount }} fases · {{ entry.plan.summary.gateCount }} Gates · {{ entry.plan.summary.plannedWeeks }} semanas · {{ entry.plan.summary.plannedJgm4Hours }} h JGM4</p>
          <div class="home-actions">
            <a class="feature-link" [routerLink]="['/projects', entry.plan.id, 'dashboard']"><strong>Dashboard do projeto <span aria-hidden="true">→</span></strong><span>Progresso, horas, atrasos, saúde e quem está com a bola.</span></a>
            <a class="feature-link" [routerLink]="['/projects', entry.plan.id, 'plan']"><strong>Plano de implantação <span aria-hidden="true">→</span></strong><span>Consulte fases, duração, horas e Gates.</span></a>
            <a class="feature-link" [routerLink]="['/projects', entry.plan.id, 'requests']"><strong>Solicitações <span aria-hidden="true">→</span></strong><span>Envie, acompanhe requisitos e valide respostas.</span></a>
            <a class="feature-link" [routerLink]="['/projects', entry.plan.id, 'alignment']"><strong>Reunião de alinhamento <span aria-hidden="true">→</span></strong><span>Preencha o roteiro e baixe o documento da reunião.</span></a>
          </div>
        </section>
      } @empty { <section class="state-panel"><h2>Nenhum projeto cadastrado</h2><p>Execute o seed local da Ollem.</p></section> }
      <p class="scope-note">JGM4 estrutura → Ollem executa e entrega evidências → JGM4 valida → Gates orientam o avanço.</p>
    }
  </main>`,
})
export class HomeComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly projects = signal<{ plan: Project; requests: ProjectRequest[] }[]>([]);
  readonly loading = signal(true); readonly error = signal('');
  companyCount() { return new Set(this.projects().map((item) => item.plan.companyId)).size; }
  requestCount() { return this.projects().reduce((sum, item) => sum + item.requests.length, 0); }
  reviewCount() { return this.projects().reduce((sum, item) => sum + item.requests.filter((req) => ['SENT_TO_JGM4', 'JGM4_REVIEW'].includes(req.status)).length, 0); }
  ngOnInit() {
    this.http.get<ProjectListItem[]>('/api/projects').pipe(
      switchMap((projects) => projects.length ? forkJoin(projects.map((item) => forkJoin({ plan: this.http.get<Project>(`/api/projects/${item.id}`), requests: this.http.get<ProjectRequest[]>(`/api/projects/${item.id}/requests`) }))) : of([])),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({ next: (projects) => { this.projects.set(projects); this.loading.set(false); }, error: () => { this.error.set('Não foi possível carregar os projetos. Verifique a API e o banco local.'); this.loading.set(false); } });
  }
  retry() { window.location.reload(); }
}
