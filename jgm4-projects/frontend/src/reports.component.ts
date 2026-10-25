import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, catchError } from 'rxjs';
import { ProjectNavComponent } from './project-nav.component';
import { ProjectDashboard, gateStatusLabels, projectStatusLabels } from './dashboard.types';
import { ReportHistoryRow, reportTypeLabels } from './reports.types';

@Component({
  selector: 'app-reports', imports: [DatePipe, FormsModule, RouterLink, ProjectNavComponent],
  template: `<main class="reports-page">
    @if (loading()) { <section class="state-panel" aria-live="polite"><span class="loader"></span><h2>Carregando relatórios…</h2></section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Relatórios indisponíveis</h2><p>{{ error() }}</p></section> }
    @else if (d(); as d) {
      <app-project-nav [projectId]="projectId" />
      <div class="page-heading"><div><p class="eyebrow">{{ d.project.company.name.toUpperCase() }}</p><h1>Central de Relatórios</h1><p class="lead">{{ d.project.name }} · {{ statusLabel(d.project.status) }}. Visualize antes de exportar; cada exportação fica registrada.</p></div></div>
      @if (d.project.status === 'ON_HOLD') { <p class="role-banner" data-testid="reports-onhold">Projeto temporariamente suspenso: os relatórios indicam a suspensão e o motivo.</p> }
      @if (d.project.status === 'CANCELLED') { <p class="role-banner" data-testid="reports-cancelled">Projeto cancelado: somente consulta e relatórios.</p> }

      <section class="report-grid" aria-label="Relatórios disponíveis">
        <article class="report-card" data-testid="rc-executive"><p class="eyebrow">VISÃO GERAL</p><h2>Relatório Executivo do Projeto</h2><p>Identificação, resumo, progresso, horas, Gates, solicitações, pendências, riscos e próximos passos.</p>
          <label class="check"><input type="checkbox" [(ngModel)]="executiveDetail"> incluir lista detalhada de solicitações</label>
          <div class="action-buttons"><a class="btn" [routerLink]="view('executive')" [queryParams]="{ detail: executiveDetail }">Visualizar</a><a class="btn secondary" [href]="api('reports/executive/pdf' + (executiveDetail ? '?detail=true' : ''))" data-testid="dl-executive">Baixar PDF</a></div></article>

        <article class="report-card" data-testid="rc-phase"><p class="eyebrow">FASE</p><h2>Relatório da Fase</h2><p>Período, progresso, atividades, horas, solicitações, pendências, riscos, Gate e próximos passos. O encerramento só existe com o Gate aprovado.</p>
          <label>Fase<select [ngModel]="phaseId()" (ngModelChange)="phaseId.set($event)" name="phase">@for (p of d.phases; track p.id) { <option [value]="p.id">Fase {{ p.order }} — {{ p.name }}</option> }</select></label>
          <div class="action-buttons"><a class="btn" [routerLink]="view('phase')" [queryParams]="{ ref: phaseId() }">Visualizar</a><a class="btn secondary" [href]="api('reports/phases/' + phaseId() + '/pdf')">Baixar PDF</a></div>
          <div class="action-buttons"><a class="btn" [class.disabled]="!closureAvailable()" [attr.aria-disabled]="!closureAvailable()" [routerLink]="closureAvailable() ? view('closure') : null" [queryParams]="{ ref: phaseId() }" data-testid="closure-view">Encerramento da fase</a>
            @if (closureAvailable()) { <a class="btn secondary" [href]="api('reports/phases/' + phaseId() + '/closure/pdf')">PDF</a> }</div>
          @if (!closureAvailable()) { <small class="muted-copy">Encerramento indisponível: o Gate desta fase ainda não foi aprovado.</small> }</article>

        <article class="report-card" data-testid="rc-gate"><p class="eyebrow">REGISTRO FORMAL</p><h2>Relatório do Gate</h2><p>Critérios, evidências, parecer técnico JGM4, decisão do cliente, usuários envolvidos e auditoria relevante.</p>
          <label>Gate<select [ngModel]="gateId()" (ngModelChange)="gateId.set($event)" name="gate">@for (p of gatePhases(); track p.id) { <option [value]="p.gate!.id">{{ p.gate!.code }} — {{ p.gate!.title }} ({{ gateLabel(p.gate!.status) }})</option> }</select></label>
          <div class="action-buttons"><a class="btn" [routerLink]="view('gate')" [queryParams]="{ ref: gateId() }">Visualizar</a><a class="btn secondary" [href]="api('reports/gates/' + gateId() + '/pdf')">Baixar PDF</a></div></article>

        <article class="report-card" data-testid="rc-final"><p class="eyebrow">ENCERRAMENTO</p><h2>Relatório Final de Implantação</h2><p>12 seções geradas dos registros do sistema. Disponível quando o Gate final estiver aprovado e a implantação concluída.</p>
          <div class="action-buttons"><a class="btn" [class.disabled]="!finalAvailable()" [routerLink]="finalAvailable() ? view('final') : null" data-testid="final-view">Visualizar</a>@if (finalAvailable()) { <a class="btn secondary" [href]="api('reports/final/pdf')">Baixar PDF</a> }</div>
          @if (!finalAvailable()) { <small class="muted-copy">Indisponível até o Gate final ser aprovado.</small> }</article>

        <article class="report-card" data-testid="rc-action-plan"><p class="eyebrow">PLANILHA</p><h2>Plano de Ação</h2><p>Todas as atividades, responsáveis, datas, próxima ação, horas planejadas e realizadas e dependências.</p>
          <div class="action-buttons"><a class="btn" [routerLink]="view('action-plan')">Visualizar</a><a class="btn secondary" [href]="api('reports/action-plan/xlsx')" data-testid="dl-action-plan">Baixar XLSX</a></div></article>

        <article class="report-card" data-testid="rc-hours"><p class="eyebrow">PLANILHA</p><h2>Relatório de Horas</h2><p>Apontamentos de esforço (somente horas, sem valores). Filtre por período, fase e organização.</p>
          <div class="form-grid"><label>De<input type="date" [(ngModel)]="hours.from" name="from"></label><label>Até<input type="date" [(ngModel)]="hours.to" name="to"></label>
            <label>Fase<select [(ngModel)]="hours.phaseId" name="hphase"><option value="">Todas</option>@for (p of d.phases; track p.id) { <option [value]="p.id">Fase {{ p.order }}</option> }</select></label>
            <label>Organização<select [(ngModel)]="hours.organization" name="horg"><option value="">Todas</option><option value="JGM4">JGM4</option><option value="CLIENT">Cliente</option></select></label></div>
          <div class="action-buttons"><a class="btn" [routerLink]="view('hours')" [queryParams]="hoursParams()">Visualizar</a><a class="btn secondary" [href]="api('reports/hours/xlsx' + hoursQuery())" data-testid="dl-hours">Baixar XLSX</a></div></article>

        <article class="report-card" data-testid="rc-requests"><p class="eyebrow">PLANILHA</p><h2>Histórico de Solicitações</h2><p>Código, fase, status, responsável, datas de criação, envio e aceite, prazo, atraso e resultado.</p>
          <div class="action-buttons"><a class="btn" [routerLink]="view('requests')">Visualizar</a><a class="btn secondary" [href]="api('reports/requests/xlsx')">Baixar XLSX</a></div></article>

        <article class="report-card" data-testid="rc-audit"><p class="eyebrow">RASTREABILIDADE</p><h2>Registro de Auditoria</h2><p>Consulta filtrável e exportação do histórico de ações. Somente leitura.</p>
          <div class="action-buttons"><a class="btn" [routerLink]="['/projects', projectId, 'audit']">Abrir auditoria</a></div></article>
      </section>

      <section class="panel" data-testid="reports-history"><div class="section-heading"><div><p class="eyebrow">RELATÓRIOS GERADOS</p><h2>Histórico de exportações</h2></div><button type="button" class="secondary" (click)="loadHistory()">Atualizar</button></div>
        <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Documento</th><th>Tipo</th><th>Usuário</th><th>Data</th></tr></thead><tbody>
          @for (row of history(); track row.id) { <tr data-testid="history-row"><td data-label="Documento">{{ row.fileName }}</td><td data-label="Tipo">{{ typeLabel(row.reportType) }} · {{ row.format }}</td><td data-label="Usuário">{{ row.by }}</td><td data-label="Data">{{ row.generatedAt | date:'dd/MM/yyyy HH:mm' }}</td></tr>
          } @empty { <tr><td colspan="4" class="empty-row">Nenhum relatório exportado ainda.</td></tr> }</tbody></table></div>
        <p class="muted-copy">Os arquivos são gerados sob demanda; só o registro da emissão é guardado.</p></section>
    }
  </main>`,
})
export class ReportsComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  projectId = '';
  readonly d = signal<ProjectDashboard | null>(null); readonly history = signal<ReportHistoryRow[]>([]); readonly loading = signal(true); readonly error = signal('');
  readonly phaseId = signal(''); readonly gateId = signal('');
  executiveDetail = false; hours = { from: '', to: '', phaseId: '', organization: '' };
  readonly gatePhases = computed(() => (this.d()?.phases ?? []).filter((phase) => phase.gate));
  readonly closureAvailable = computed(() => this.d()?.phases.find((phase) => phase.id === this.phaseId())?.gate?.status === 'APPROVED');
  readonly finalAvailable = computed(() => { const d = this.d(); const last = d?.phases[d.phases.length - 1]; return !!d && ['IMPLEMENTATION_COMPLETED', 'COMPLETED'].includes(d.project.status) && last?.gate?.status === 'APPROVED'; });
  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({ d: this.http.get<ProjectDashboard>(`/api/projects/${this.projectId}/dashboard`), history: this.http.get<ReportHistoryRow[]>(`/api/projects/${this.projectId}/reports/history`).pipe(catchError(() => of([]))) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ d, history }) => { this.d.set(d); this.history.set(history); this.phaseId.set(d.currentPhase?.id ?? d.phases[0]?.id ?? ''); this.gateId.set(d.gate?.id ?? d.phases.find((phase) => phase.gate)?.gate?.id ?? ''); this.loading.set(false); },
        error: (e: HttpErrorResponse) => { this.error.set(e.status === 403 ? 'Você não tem acesso a este projeto.' : 'Não foi possível carregar os relatórios.'); this.loading.set(false); },
      });
  }
  loadHistory() { this.http.get<ReportHistoryRow[]>(`/api/projects/${this.projectId}/reports/history`).subscribe((rows) => this.history.set(rows)); }
  api(path: string) { return `/api/projects/${this.projectId}/${path}`; }
  view(kind: string) { return ['/projects', this.projectId, 'reports', 'view', kind]; }
  hoursParams() { return Object.fromEntries(Object.entries(this.hours).filter(([, value]) => value)); }
  hoursQuery() { const query = new URLSearchParams(this.hoursParams() as Record<string, string>).toString(); return query ? `?${query}` : ''; }
  statusLabel(status: string) { return projectStatusLabels[status] ?? status; }
  gateLabel(status: string) { return gateStatusLabels[status] ?? status; }
  typeLabel(type: string) { return reportTypeLabels[type] ?? type; }
}
