import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectNavComponent } from './project-nav.component';
import { AuditItem } from './reports.types';

const PAGE = 50;

@Component({
  selector: 'app-audit', imports: [DatePipe, FormsModule, RouterLink, ProjectNavComponent],
  template: `<main class="audit-page">
    <app-project-nav [projectId]="projectId" />
    <div class="page-heading"><div><p class="eyebrow">RASTREABILIDADE</p><h1>Registro de Auditoria</h1><p class="lead">Histórico de ações do projeto. Somente leitura: registros não podem ser editados ou apagados.</p></div>
      <a class="btn secondary" [href]="xlsxUrl()" data-testid="audit-xlsx">Exportar XLSX</a></div>
    <form class="panel task-form audit-filters" (ngSubmit)="search()" aria-label="Filtros da auditoria">
      <div class="form-grid">
        <label>De<input type="date" name="from" [(ngModel)]="filters.from"></label><label>Até<input type="date" name="to" [(ngModel)]="filters.to"></label>
        <label>Usuário<select name="userId" [(ngModel)]="filters.userId"><option value="">Todos</option>@for (u of users(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></label>
        <label>Entidade<select name="entityType" [(ngModel)]="filters.entityType"><option value="">Todas</option>@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select></label>
        <label>Ação (contém)<input name="action" [(ngModel)]="filters.action" placeholder="ex.: VALIDATE" maxlength="80"></label>
      </div>
      <div class="action-buttons"><button type="submit" data-testid="audit-search">Filtrar</button><button type="button" class="secondary" (click)="clear()">Limpar</button></div>
    </form>
    @if (error()) { <section class="state-panel" role="alert"><h2>Auditoria indisponível</h2><p>{{ error() }}</p></section> }
    @else {
      <p class="list-count" aria-live="polite" data-testid="audit-count">{{ items().length }} de {{ total() }} registros</p>
      <div class="request-table-wrap"><table class="request-table stack-table" data-testid="audit-table"><caption class="sr-only">Registros de auditoria</caption>
        <thead><tr><th>Data/hora</th><th>Usuário</th><th>Perfil</th><th>Ação</th><th>Entidade</th><th>Valores</th><th>Contexto</th></tr></thead><tbody>
          @for (item of items(); track item.id) {
            <tr data-testid="audit-row"><td data-label="Data/hora">{{ item.at | date:'dd/MM/yyyy HH:mm:ss' }}</td><td data-label="Usuário">{{ item.user }}</td><td data-label="Perfil">{{ item.role }}</td><td data-label="Ação"><code>{{ item.action }}</code></td><td data-label="Entidade">{{ item.entity }}</td>
              <td data-label="Valores">@if (item.before || item.after) { <details><summary>anterior → novo</summary>@if (item.before) { <small>Anterior:</small><pre>{{ item.before }}</pre> }<small>Novo:</small><pre>{{ item.after }}</pre></details> } @else { — }</td><td data-label="Contexto">{{ item.context || '—' }}</td></tr>
          } @empty { <tr><td colspan="7" class="empty-row">Nenhum registro neste filtro.</td></tr> }</tbody></table></div>
      @if (items().length < total()) { <div class="action-buttons"><button type="button" class="secondary" (click)="more()" data-testid="audit-more">Carregar mais</button></div> }
    }
    <p class="scope-note">Para um relatório formal de um Gate, use a <a [routerLink]="['/projects', projectId, 'reports']">Central de Relatórios</a>.</p>
  </main>`,
})
export class AuditComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  projectId = ''; filters = { from: '', to: '', userId: '', entityType: '', action: '' };
  readonly items = signal<AuditItem[]>([]); readonly total = signal(0); readonly error = signal(''); readonly users = signal<{ id: string; name: string }[]>([]);
  readonly types = ['Task', 'ProjectRequest', 'Gate', 'Phase', 'Approval', 'TimeEntry', 'Project', 'SustainmentItem', 'CarriedOverItem'];
  ngOnInit() { this.projectId = this.route.snapshot.paramMap.get('id') ?? ''; this.search(); }
  private query(offset = 0) {
    const entries = Object.entries(this.filters).filter(([, value]) => value) as [string, string][];
    return new URLSearchParams([...entries, ['limit', String(PAGE)], ['offset', String(offset)]]).toString();
  }
  xlsxUrl() { const entries = Object.entries(this.filters).filter(([, value]) => value) as [string, string][]; const q = new URLSearchParams(entries).toString(); return `/api/projects/${this.projectId}/audit/xlsx${q ? `?${q}` : ''}`; }
  private load(offset: number) {
    this.http.get<{ total: number; items: (AuditItem & { userId: string | null })[] }>(`/api/projects/${this.projectId}/audit?${this.query(offset)}`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => { this.error.set(''); this.total.set(page.total); this.items.set(offset ? [...this.items(), ...page.items] : page.items);
        const known = new Map(this.users().map((user) => [user.id, user])); for (const item of page.items) if (item.userId) known.set(item.userId, { id: item.userId, name: item.user }); this.users.set([...known.values()]); },
      error: (e: HttpErrorResponse) => this.error.set(e.status === 403 ? 'Seu perfil não tem acesso à auditoria deste projeto.' : 'Não foi possível carregar a auditoria.'),
    });
  }
  search() { this.load(0); }
  more() { this.load(this.items().length); }
  clear() { this.filters = { from: '', to: '', userId: '', entityType: '', action: '' }; this.load(0); }
}
