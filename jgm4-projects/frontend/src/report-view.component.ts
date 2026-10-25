import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { apiUrl } from './api-path';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, tap, combineLatest } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { ReportDoc } from './reports.types';

// kind → [rota JSON, sufixo do download]
const ROUTES: Record<string, (ref: string) => [string, string]> = {
  executive: () => ['reports/executive', 'reports/executive/pdf'], phase: (ref) => [`reports/phases/${ref}`, `reports/phases/${ref}/pdf`], closure: (ref) => [`reports/phases/${ref}/closure`, `reports/phases/${ref}/closure/pdf`],
  gate: (ref) => [`reports/gates/${ref}`, `reports/gates/${ref}/pdf`], final: () => ['reports/final', 'reports/final/pdf'], 'action-plan': () => ['reports/action-plan', 'reports/action-plan/xlsx'],
  hours: () => ['reports/hours', 'reports/hours/xlsx'], requests: () => ['reports/requests', 'reports/requests/xlsx'],
};

@Component({
  selector: 'app-report-view', imports: [DatePipe, RouterLink, ProjectNavComponent],
  template: `<main class="report-view">
    <app-project-nav [projectId]="projectId" />
    @if (loading()) { <section class="state-panel" aria-live="polite"><span class="loader"></span><h2>Montando o relatório…</h2></section> }
    @else if (error()) { <section class="state-panel" role="alert" data-testid="report-error"><h2>Relatório indisponível</h2><p>{{ error() }}</p><a class="btn secondary" [routerLink]="['/projects', projectId, 'reports']">Voltar à Central de Relatórios</a></section> }
    @else if (doc(); as doc) {
      <header class="report-head">
        <div><p class="eyebrow">PRÉ-VISUALIZAÇÃO · NADA FOI EXPORTADO</p><h1 data-testid="report-title">{{ doc.title }}</h1>@if (doc.subtitle) { <p class="lead">{{ doc.subtitle }}</p> }<p class="muted-copy">Emitido em {{ doc.emittedAt | date:'dd/MM/yyyy HH:mm' }} por {{ doc.emittedBy }} · {{ doc.fileName }}</p></div>
        <div class="action-buttons"><a class="btn" [href]="downloadUrl()" data-testid="report-download">{{ downloadUrl().includes('/xlsx') ? 'Baixar XLSX' : 'Baixar PDF' }}</a><a class="btn secondary" [routerLink]="['/projects', projectId, 'reports']">Central de Relatórios</a></div>
      </header>
      @for (section of doc.sections; track $index) {
        @switch (section.type) {
          @case ('kv') { <section class="panel rs">@if (section.title) { <h2>{{ section.title }}</h2> }<dl class="rs-kv">@for (row of section.rows; track row[0]) { <div><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></div> }</dl></section> }
          @case ('paragraph') { <section class="panel rs">@if (section.title) { <h2>{{ section.title }}</h2> }<p>{{ section.text }}</p></section> }
          @case ('bullets') { <section class="panel rs"><h2>{{ section.title }}</h2>@if (section.items.length) { <ul class="plain-list">@for (item of section.items; track $index) { <li>{{ item }}</li> }</ul> } @else { <p class="muted-copy">{{ section.empty || 'Nenhum item.' }}</p> }</section> }
          @case ('progress') { <section class="panel rs"><h2>{{ section.title }}</h2>@for (item of section.items; track item.label) { <div class="progress-line"><strong class="rs-label">{{ item.label }}</strong><div class="bar"><span [style.width.%]="item.percent"></span></div><span>{{ item.percent }}% <small class="muted-copy">{{ item.detail }}</small></span></div> }</section> }
          @case ('callout') { <section class="rs-callout" [class]="'rs-callout co-' + section.variant" [attr.data-testid]="'callout-' + section.variant"><h2>{{ section.title }}</h2>@for (line of section.lines; track $index) { <p>{{ line }}</p> }</section> }
          @case ('table') { <section class="panel rs"><h2>{{ section.title }}</h2>
            <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr>@for (c of section.columns; track c.key) { <th [style.text-align]="c.align || 'left'">{{ c.label }}</th> }</tr></thead>
              <tbody>@for (row of section.rows; track $index) { <tr>@for (c of section.columns; track c.key) { <td [attr.data-label]="c.label" [style.text-align]="c.align || 'left'">{{ row[c.key] ?? '—' }}</td> }</tr> } @empty { <tr><td [attr.colspan]="section.columns.length" class="empty-row">{{ section.empty || 'Sem registros.' }}</td></tr> }</tbody></table></div></section> }
        }
      }
    }
  </main>`,
})
export class ReportViewComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  projectId = ''; readonly doc = signal<ReportDoc | null>(null); readonly loading = signal(true); readonly error = signal(''); readonly downloadUrl = signal('');
  ngOnInit() {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(tap(() => { this.loading.set(true); this.error.set(''); }), switchMap(([params, query]) => {
      this.projectId = params.get('id') ?? ''; const route = ROUTES[params.get('kind') ?? ''];
      if (!route) { this.error.set('Tipo de relatório desconhecido.'); this.loading.set(false); return EMPTY; }
      const [json, download] = route(query.get('ref') ?? ''); const extra = new URLSearchParams(); for (const key of ['detail', 'from', 'to', 'phaseId', 'organization']) { const value = query.get(key); if (value) extra.set(key, value); }
      const suffix = extra.toString() ? `?${extra}` : ''; this.downloadUrl.set(apiUrl(`/projects/${this.projectId}/${download}${suffix}`));
      return this.http.get<ReportDoc>(`/api/projects/${this.projectId}/${json}${suffix}`).pipe(catchError((e: HttpErrorResponse) => {
        const message = e.error?.message; this.error.set(e.status === 403 ? 'Você não tem acesso a este relatório.' : typeof message === 'string' ? message : 'Não foi possível montar o relatório.'); this.loading.set(false); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((doc) => { this.doc.set(doc); this.loading.set(false); });
  }
}
