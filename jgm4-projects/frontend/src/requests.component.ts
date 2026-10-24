import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, EMPTY, catchError, combineLatest, forkJoin, switchMap } from 'rxjs';
import { Project } from './project.types';
import { ProjectNavComponent } from './project-nav.component';
import { ProjectRequest, apiError, ownerLabels, requestStatusLabels } from './request.types';

@Component({
  selector: 'app-requests', imports: [RouterLink, DatePipe, ProjectNavComponent],
  template: `<main>
    <div class="page-heading"><div><p class="eyebrow">FILA CONTROLADA</p><h1>Solicitações</h1><p class="lead">{{ project()?.company?.name }} · {{ project()?.name }}</p></div><button class="secondary" (click)="refresh()">Atualizar fila</button></div>
    <app-project-nav [projectId]="projectId" />
    <div class="filter-tabs" role="group" aria-label="Filtrar solicitações">
      @for (tab of tabs; track tab.id) { <button type="button" [class.selected]="filter() === tab.id" [attr.aria-pressed]="filter() === tab.id" (click)="setFilter(tab.id)">{{ tab.label }}</button> }
    </div>
    @if (loading()) { <section class="state-panel" aria-live="polite">Carregando solicitações…</section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Consulta indisponível</h2><p>{{ error() }}</p></section> }
    @else {
      <p class="list-count" aria-live="polite">{{ requests().length }} solicitações nesta consulta</p>
      <div class="request-table-wrap"><table class="request-table"><caption class="sr-only">Fila de solicitações do projeto</caption><thead><tr><th>Código / fase</th><th>Solicitação</th><th>Responsável / prazo</th><th>Status</th><th>Regras</th><th>Próxima ação</th></tr></thead><tbody>
        @for (item of requests(); track item.id) {
          <tr data-testid="request-row"><td><a [routerLink]="['/projects', projectId, 'requests', item.id]" class="code-link">{{ item.code }}</a><small>Fase {{ item.phase.order }}</small></td>
          <td><a [routerLink]="['/projects', projectId, 'requests', item.id]">{{ item.title }}</a>@if (item.blockedReason) { <small class="blocking-reason">{{ item.blockedReason }}</small> }</td>
          <td>{{ item.clientResponsible?.name || 'A definir' }}<small>{{ item.dueDate ? (item.dueDate | date:'dd/MM/yyyy':'UTC') : 'Prazo a definir' }}</small></td>
          <td><span class="badge" [class.badge-available]="item.status === 'AVAILABLE'">{{ labels[item.status] }}</span></td>
          <td><small>{{ item.mandatory ? 'Obrigatória' : 'Opcional' }}</small><small>{{ item.blocking ? 'Bloqueante' : 'Não bloqueante' }}</small></td>
          <td><strong class="owner-label">{{ owners[item.currentOwnerType] }}</strong><small>{{ item.nextAction }}</small></td></tr>
        } @empty { <tr><td colspan="6" class="empty-row">Nenhuma solicitação neste filtro.</td></tr> }
      </tbody></table></div>
      <p class="scope-note">Visão JGM4: inclui a fila futura. Solicitações futuras aguardam o Gate anterior. Datas e responsáveis não informados permanecem a definir.</p>
    }
  </main>`,
})
export class RequestsComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  private readonly filters = new BehaviorSubject('all');
  projectId = ''; readonly project = signal<Project | null>(null); readonly requests = signal<ProjectRequest[]>([]);
  readonly filter = signal('all'); readonly loading = signal(true); readonly error = signal('');
  readonly labels = requestStatusLabels; readonly owners = ownerLabels;
  readonly tabs = [{ id: 'all', label: 'Todas' }, { id: 'available', label: 'Disponíveis' }, { id: 'client', label: 'Aguardando Ollem' }, { id: 'jgm4', label: 'Aguardando JGM4' }, { id: 'blocked', label: 'Bloqueadas' }, { id: 'accepted', label: 'Aceitas' }];
  ngOnInit() {
    combineLatest([this.route.paramMap, this.filters]).pipe(switchMap(([params, filter]) => {
      this.projectId = params.get('id')!; this.loading.set(true); this.error.set('');
      return forkJoin({ project: this.http.get<Project>(`/api/projects/${this.projectId}`), requests: this.http.get<ProjectRequest[]>(`/api/projects/${this.projectId}/requests`, { params: { filter } }) }).pipe(catchError((error) => { this.error.set(apiError(error)); this.loading.set(false); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ project, requests }) => { this.project.set(project); this.requests.set(requests); this.loading.set(false); });
  }
  setFilter(filter: string) { this.filter.set(filter); this.filters.next(filter); }
  refresh() { this.filters.next(this.filter()); }
}
