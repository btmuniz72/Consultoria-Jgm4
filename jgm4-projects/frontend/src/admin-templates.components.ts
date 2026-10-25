import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminNavComponent } from './admin-ops.components';
import { apiMessages } from './password-pages.component';

export const templateStatusLabels: Record<string, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', INACTIVE: 'Inativo', ARCHIVED: 'Arquivado' };
interface TemplateRow { id: string; code: string; name: string; description: string; version: number; status: string; phases: number; tasks: number; gates: number; requests: number; projects: number; updatedAt: string; validatedAt: string | null }
interface Row { id: string; [key: string]: unknown }
interface Detail extends TemplateRow { phaseList: Row[]; taskList: (Row & { checklist: Row[] })[]; gateList: (Row & { criteria: Row[] })[]; requestList: (Row & { requirements: Row[] })[]; dependencyList: Row[] }
interface Preview { totals: Record<string, number>; phases: { order: number; name: string; plannedWeeks: number; jgm4Hours: number; clientHours: number; tasks: { code: string; title: string; jgm4Hours: number; clientHours: number; checklist: number; after: string | null }[]; requests: { code: string; title: string; blocking: boolean; requirements: number }[]; gate: { code: string; title: string; question: string; criteria: number } | null }[] }
interface Validation { valid: boolean; errors: string[]; warnings: string[] }

@Component({
  selector: 'app-admin-templates', imports: [FormsModule, DatePipe, RouterLink, AdminNavComponent],
  template: `<main class="account-page"><div class="page-heading"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Templates de projeto</h1><p class="lead">Modelos reutilizáveis. Um projeto recebe uma cópia independente: mudar o template não altera projetos existentes.</p></div><button type="button" (click)="creating.set(!creating())" data-testid="template-new">Novo template</button></div>
    <app-admin-nav />
    @if (error()) { <p class="error-note" role="alert" data-testid="admin-error">{{ error() }}</p> }
    @if (creating()) { <section class="panel" data-testid="template-form"><h2>Novo template (rascunho)</h2>
      <form class="task-form inline-form" (ngSubmit)="create()"><div class="form-grid">
        <label>Nome<input name="name" required minlength="3" [(ngModel)]="form.name" data-testid="template-name"></label>
        <label>Código (letras maiúsculas, números e _)<input name="code" required pattern="[A-Z0-9_]{2,40}" [(ngModel)]="form.code" data-testid="template-code"></label></div>
        <label>Descrição<textarea name="description" rows="2" required minlength="3" [(ngModel)]="form.description" data-testid="template-description"></textarea></label>
        <div class="action-buttons"><button type="submit" data-testid="template-save">Criar rascunho</button><button type="button" class="secondary" (click)="creating.set(false)">Cancelar</button></div></form></section> }
    <section class="panel" data-testid="templates-panel"><div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Template</th><th>Código</th><th>Versão</th><th>Situação</th><th>Fases</th><th>Atividades</th><th>Atualizado</th><th></th></tr></thead><tbody>
      @for (t of templates(); track t.id) { <tr data-testid="template-row"><td data-label="Template">{{ t.name }}<small>{{ t.projects }} projeto(s) criados</small></td><td data-label="Código">{{ t.code }}</td><td data-label="Versão">v{{ t.version }}</td>
        <td data-label="Situação">{{ label(t.status) }}</td><td data-label="Fases">{{ t.phases }}</td><td data-label="Atividades">{{ t.tasks }}</td><td data-label="Atualizado">{{ t.updatedAt | date:'dd/MM/yyyy HH:mm' }}</td>
        <td class="row-actions"><a class="quiet-button" [routerLink]="['/admin/templates', t.id]" [attr.data-testid]="'template-open-' + t.code + '-v' + t.version">Abrir</a></td></tr>
      } @empty { <tr><td colspan="8" class="empty-row">Nenhum template cadastrado.</td></tr> }</tbody></table></div></section></main>`,
})
export class AdminTemplatesComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly router = inject(Router);
  readonly templates = signal<TemplateRow[]>([]); readonly creating = signal(false); readonly error = signal('');
  form = { name: '', code: '', description: '' }; label(status: string) { return templateStatusLabels[status] ?? status; }
  ngOnInit() { this.http.get<TemplateRow[]>('/api/admin/templates').subscribe({ next: (rows) => this.templates.set(rows), error: (e: HttpErrorResponse) => this.error.set(apiMessages(e, 'Não foi possível carregar os templates.')) }); }
  create() { this.http.post<TemplateRow>('/api/admin/templates', this.form).subscribe({ next: (t) => void this.router.navigate(['/admin/templates', t.id]), error: (e: HttpErrorResponse) => this.error.set(apiMessages(e, 'Não foi possível criar o template.')) }); }
}

// ---------------------------------------------------------------------------------------------------------------- editor
interface Field { name: string; label: string; type: 'text' | 'textarea' | 'int' | 'number' | 'bool' | 'select'; options?: () => { value: string; label: string }[]; required?: boolean }
interface Section { kind: string; title: string; hint: string; fields: Field[]; rows: () => Row[]; columns: (row: Row) => string; parent?: string }
const RESP = [{ value: 'JOINT', label: 'Conjunta' }, { value: 'JGM4', label: 'JGM4' }, { value: 'CLIENT', label: 'Cliente' }];

@Component({
  selector: 'app-admin-template-editor', imports: [FormsModule, DatePipe, RouterLink, AdminNavComponent],
  template: `<main class="account-page">
    <div class="page-heading"><div><p class="eyebrow">TEMPLATE</p><h1 data-testid="template-title">{{ d()?.name }} <small>v{{ d()?.version }}</small></h1><p class="lead">{{ d()?.code }} · {{ label(d()?.status || '') }} · {{ d()?.projects }} projeto(s) criados · atualizado {{ d()?.updatedAt | date:'dd/MM/yyyy HH:mm' }}</p></div><a class="btn secondary" routerLink="/admin/templates">Voltar</a></div>
    <app-admin-nav />
    @if (notice()) { <p class="success-note" role="status" data-testid="admin-notice">{{ notice() }}</p> }
    @if (error()) { <p class="error-note" role="alert" data-testid="admin-error">{{ error() }}</p> }
    @if (d(); as t) {
      <section class="panel" data-testid="template-actions"><div class="action-buttons">
        <button type="button" class="secondary" (click)="togglePreview()" data-testid="template-preview">Visualizar estrutura</button>
        @if (t.status === 'DRAFT') { <button type="button" class="secondary" (click)="validate()" data-testid="template-validate">Validar template</button>
          <label class="check"><input type="checkbox" [(ngModel)]="inactivatePrevious" data-testid="template-inactivate-previous"> Inativar versões ativas anteriores</label>
          <button type="button" (click)="activate()" data-testid="template-activate">Ativar</button> }
        @if (t.status !== 'DRAFT' && t.status !== 'ARCHIVED') { <button type="button" (click)="newVersion()" data-testid="template-new-version">Criar nova versão</button> }
        @if (t.status === 'ACTIVE') { <button type="button" class="secondary" (click)="post('inactivate', 'Template inativado.')">Inativar</button> }
        @if (t.status === 'INACTIVE') { <button type="button" class="secondary" (click)="post('reactivate', 'Template reativado.')">Reativar</button> }
        @if (t.status !== 'ARCHIVED') { <button type="button" class="secondary danger" (click)="archive()" data-testid="template-archive">Arquivar</button> }</div>
        @if (t.status !== 'DRAFT') { <p class="muted-copy">Esta versão não tem a estrutura editável. Para alterar, crie uma nova versão (rascunho); projetos existentes não são afetados.</p> }</section>
      @if (validation(); as v) { <section class="panel" data-testid="validation-panel"><h2>{{ v.valid ? 'Template válido' : 'Template com erros' }}</h2>
        @if (v.errors.length) { <ul class="history-list" data-testid="validation-errors">@for (e of v.errors; track e) { <li class="error-note">{{ e }}</li> }</ul> }
        @if (v.warnings.length) { <ul class="history-list" data-testid="validation-warnings">@for (w of v.warnings; track w) { <li class="muted-copy">Aviso: {{ w }}</li> }</ul> }
        @if (!v.errors.length && !v.warnings.length) { <p class="muted-copy">Nenhum erro ou aviso.</p> }</section> }
      @if (preview(); as p) { <section class="panel" data-testid="preview-panel"><h2>Estrutura</h2><p class="muted-copy">{{ p.totals['phases'] }} fases · {{ p.totals['tasks'] }} atividades · {{ p.totals['requests'] }} solicitações · {{ p.totals['gates'] }} Gates · {{ p.totals['jgm4Hours'] }} h JGM4 · {{ p.totals['clientHours'] }} h cliente</p>
        @for (phase of p.phases; track phase.order) { <details class="preview-phase" [open]="phase.order === 0"><summary data-testid="preview-phase">Fase {{ phase.order }} — {{ phase.name }} <small>{{ phase.tasks.length }} atividades · {{ phase.jgm4Hours }} h JGM4</small></summary>
          <ul class="history-list">@for (task of phase.tasks; track task.code) { <li><div><strong>{{ task.code }} — {{ task.title }}</strong><span>{{ task.jgm4Hours }} h JGM4 · {{ task.clientHours }} h cliente · {{ task.checklist }} itens{{ task.after ? ' · após ' + task.after : '' }}</span></div></li> }
            @for (r of phase.requests; track r.code) { <li><div><strong>{{ r.code }} — {{ r.title }}</strong><span>Solicitação{{ r.blocking ? ' bloqueante' : '' }} · {{ r.requirements }} requisitos</span></div></li> }
            @if (phase.gate; as g) { <li><div><strong>{{ g.code }} — {{ g.title }}</strong><span>Gate · {{ g.question }} · {{ g.criteria }} critérios</span></div></li> }</ul></details> }</section> }
      @if (t.status === 'DRAFT') {
        @for (s of sections; track s.kind) { <section class="panel" [attr.data-testid]="'section-' + s.kind"><div class="section-heading"><div><h2>{{ s.title }}</h2><p class="muted-copy">{{ s.hint }}</p></div></div>
          <div class="request-table-wrap"><table class="request-table"><tbody>
            @for (row of s.rows(); track row.id) { <tr><td>{{ s.columns(row) }}</td><td class="row-actions"><button type="button" class="quiet-button" (click)="edit(s, row)">Editar</button><button type="button" class="quiet-button" (click)="remove(s, row)">Remover</button></td></tr> } @empty { <tr><td class="empty-row">Nada cadastrado.</td></tr> }</tbody></table></div>
          <form class="task-form inline-form" (ngSubmit)="save(s)"><h3>{{ editing[s.kind] ? 'Editar item' : 'Adicionar' }}</h3><div class="form-grid">
            @if (s.parent) { <label>{{ parentLabel(s) }}<select [name]="s.parent" required [(ngModel)]="forms[s.kind][s.parent]" [disabled]="!!editing[s.kind]" [attr.data-testid]="s.kind + '-parent'">@for (o of parentOptions(s); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></label> }
            @for (f of s.fields; track f.name) { <label [class.check]="f.type === 'bool'">{{ f.label }}
              @switch (f.type) {
                @case ('textarea') { <textarea [name]="f.name" rows="2" [(ngModel)]="forms[s.kind][f.name]" [attr.data-testid]="s.kind + '-' + f.name"></textarea> }
                @case ('bool') { <input type="checkbox" [name]="f.name" [(ngModel)]="forms[s.kind][f.name]"> }
                @case ('select') { <select [name]="f.name" [(ngModel)]="forms[s.kind][f.name]" [attr.data-testid]="s.kind + '-' + f.name"><option value="">—</option>@for (o of f.options!(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select> }
                @case ('int') { <input type="number" step="1" [name]="f.name" [(ngModel)]="forms[s.kind][f.name]" [attr.data-testid]="s.kind + '-' + f.name"> }
                @case ('number') { <input type="number" step="0.5" [name]="f.name" [(ngModel)]="forms[s.kind][f.name]" [attr.data-testid]="s.kind + '-' + f.name"> }
                @default { <input [name]="f.name" [(ngModel)]="forms[s.kind][f.name]" [attr.data-testid]="s.kind + '-' + f.name"> }
              } </label> }</div>
            <div class="action-buttons"><button type="submit" [attr.data-testid]="s.kind + '-save'">{{ editing[s.kind] ? 'Salvar alteração' : 'Adicionar' }}</button>@if (editing[s.kind]) { <button type="button" class="secondary" (click)="reset(s)">Cancelar edição</button> }</div></form></section> }
      }
    }
  </main>`,
})
export class AdminTemplateEditorComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  readonly d = signal<Detail | null>(null); readonly validation = signal<Validation | null>(null); readonly preview = signal<Preview | null>(null); readonly notice = signal(''); readonly error = signal('');
  id = ''; inactivatePrevious = false; forms: Record<string, Record<string, unknown>> = {}; editing: Record<string, string | null> = {};
  label(status: string) { return templateStatusLabels[status] ?? status; }
  private phases = () => (this.d()?.phaseList ?? []).map((p) => ({ value: p.id, label: `Fase ${p['order']} — ${p['name']}` }));
  sections: Section[] = [
    { kind: 'phases', title: 'Fases', hint: 'Sequência contínua a partir de 0; horas JGM4 e do cliente planejadas.', rows: () => this.d()?.phaseList ?? [], columns: (r) => `Fase ${r['order']} — ${r['name']} · ${r['plannedWeeks']} sem · ${r['plannedJgm4Hours']} h JGM4${r['plannedClientHours'] != null ? ' · ' + r['plannedClientHours'] + ' h cliente' : ''}`,
      fields: [{ name: 'order', label: 'Sequência', type: 'int' }, { name: 'name', label: 'Título', type: 'text' }, { name: 'description', label: 'Descrição', type: 'textarea' }, { name: 'plannedWeeks', label: 'Duração (semanas)', type: 'int' }, { name: 'plannedJgm4Hours', label: 'Horas JGM4', type: 'int' }, { name: 'plannedClientHours', label: 'Horas cliente', type: 'number' }] },
    { kind: 'gates', title: 'Gates', hint: 'Um Gate por fase: ponto formal de decisão.', rows: () => this.d()?.gateList ?? [], columns: (r) => `${r['code']} — ${r['title']} (${this.phaseName(String(r['phaseId']))})`,
      fields: [{ name: 'phaseId', label: 'Fase', type: 'select', options: this.phases }, { name: 'code', label: 'Código', type: 'text' }, { name: 'title', label: 'Nome', type: 'text' }, { name: 'question', label: 'Pergunta de decisão', type: 'textarea' }, { name: 'description', label: 'Descrição', type: 'textarea' }] },
    { kind: 'criteria', title: 'Critérios dos Gates', hint: 'Critérios que sustentam a decisão do Gate.', parent: 'gateId', rows: () => (this.d()?.gateList ?? []).flatMap((g) => g.criteria.map((c) => ({ ...c, gateId: g.id, gateCode: g['code'] }))), columns: (r) => `${r['gateCode']} · ${r['code']} — ${r['description']}`,
      fields: [{ name: 'code', label: 'Código', type: 'text' }, { name: 'description', label: 'Critério', type: 'textarea' }, { name: 'sourceType', label: 'Origem', type: 'select', options: () => ['MANUAL', 'TASK', 'REQUEST', 'INDICATOR', 'DOCUMENT'].map((v) => ({ value: v, label: v })) }, { name: 'evidenceRequired', label: 'Exige evidência', type: 'bool' }, { name: 'order', label: 'Ordem', type: 'int' }] },
    { kind: 'tasks', title: 'Atividades', hint: 'Código, responsabilidade, horas JGM4/cliente e fase.', rows: () => this.d()?.taskList ?? [], columns: (r) => `${r['code']} — ${r['title']} (${this.phaseName(String(r['phaseId']))}) · ${r['plannedJgm4Hours']} h JGM4 · ${r['plannedClientHours']} h cliente`,
      fields: [{ name: 'phaseId', label: 'Fase', type: 'select', options: this.phases }, { name: 'code', label: 'Código', type: 'text' }, { name: 'title', label: 'Título', type: 'text' }, { name: 'description', label: 'Descrição', type: 'textarea' }, { name: 'objective', label: 'Objetivo', type: 'textarea' }, { name: 'instructions', label: 'Instruções', type: 'textarea' }, { name: 'acceptanceCriteria', label: 'Critério de aceite', type: 'textarea' },
        { name: 'responsibilityType', label: 'Responsabilidade', type: 'select', options: () => RESP }, { name: 'priority', label: 'Prioridade', type: 'select', options: () => [{ value: 'LOW', label: 'Baixa' }, { value: 'NORMAL', label: 'Normal' }, { value: 'HIGH', label: 'Alta' }] }, { name: 'plannedJgm4Hours', label: 'Horas JGM4', type: 'number' }, { name: 'plannedClientHours', label: 'Horas cliente', type: 'number' }, { name: 'order', label: 'Ordem', type: 'int' }] },
    { kind: 'checklist', title: 'Checklist das atividades', hint: 'Cada projeto recebe uma cópia independente.', parent: 'taskId', rows: () => (this.d()?.taskList ?? []).flatMap((t) => t.checklist.map((c) => ({ ...c, taskId: t.id, taskCode: t['code'] }))), columns: (r) => `${r['taskCode']} · ${r['label']}`,
      fields: [{ name: 'label', label: 'Item', type: 'text' }, { name: 'required', label: 'Obrigatório', type: 'bool' }, { name: 'order', label: 'Ordem', type: 'int' }] },
    { kind: 'requests', title: 'Solicitações', hint: 'Itens pedidos ao cliente; prazo relativo opcional (dias após o início do projeto).', rows: () => this.d()?.requestList ?? [], columns: (r) => `${r['code']} — ${r['title']} (${this.phaseName(String(r['phaseId']))})${r['blocking'] ? ' · bloqueante' : ''}`,
      fields: [{ name: 'phaseId', label: 'Fase', type: 'select', options: this.phases }, { name: 'code', label: 'Código', type: 'text' }, { name: 'title', label: 'Título', type: 'text' }, { name: 'description', label: 'Descrição', type: 'textarea' }, { name: 'instructions', label: 'Instruções', type: 'textarea' }, { name: 'acceptanceCriteria', label: 'Critério de aceite', type: 'textarea' }, { name: 'blocking', label: 'Bloqueante', type: 'bool' }, { name: 'relativeDueDays', label: 'Prazo relativo (dias)', type: 'int' }, { name: 'order', label: 'Ordem', type: 'int' }] },
    { kind: 'requirements', title: 'Requisitos das solicitações', hint: 'O que o cliente precisa informar.', parent: 'requestId', rows: () => (this.d()?.requestList ?? []).flatMap((q) => q.requirements.map((c) => ({ ...c, requestId: q.id, requestCode: q['code'] }))), columns: (r) => `${r['requestCode']} · ${r['label']}`,
      fields: [{ name: 'label', label: 'Requisito', type: 'text' }, { name: 'required', label: 'Obrigatório', type: 'bool' }, { name: 'order', label: 'Ordem', type: 'int' }] },
    { kind: 'dependencies', title: 'Dependências', hint: 'Atividade após atividade; atividade bloqueada por Gate de fase anterior; solicitação vinculada à atividade (mesma fase).', rows: () => this.d()?.dependencyList ?? [],
      columns: (r) => ({ TASK_AFTER_TASK: `${r['fromCode']} só começa após ${r['toCode']}`, TASK_BLOCKED_BY_GATE: `${r['fromCode']} é bloqueada pelo ${r['toCode']}`, REQUEST_FOR_TASK: `${r['fromCode']} (solicitação) vinculada à atividade ${r['toCode']}` } as Record<string, string>)[String(r['kind'])] ?? '',
      fields: [{ name: 'kind', label: 'Tipo', type: 'select', options: () => [{ value: 'TASK_AFTER_TASK', label: 'Atividade após atividade' }, { value: 'TASK_BLOCKED_BY_GATE', label: 'Atividade bloqueada por Gate' }, { value: 'REQUEST_FOR_TASK', label: 'Solicitação para atividade' }] }, { name: 'fromCode', label: 'Origem (código)', type: 'text' }, { name: 'toCode', label: 'Destino (código)', type: 'text' }] },
  ];
  private phaseName(id: string) { const phase = this.d()?.phaseList.find((p) => p.id === id); return phase ? `Fase ${phase['order']}` : '?'; }
  parentOptions(s: Section) { const d = this.d(); if (!d) return []; if (s.parent === 'gateId') return d.gateList.map((g) => ({ value: g.id, label: String(g['code']) })); if (s.parent === 'taskId') return d.taskList.map((t) => ({ value: t.id, label: `${t['code']} — ${t['title']}` })); return d.requestList.map((q) => ({ value: q.id, label: `${q['code']} — ${q['title']}` })); }
  parentLabel(s: Section) { return s.parent === 'gateId' ? 'Gate' : s.parent === 'taskId' ? 'Atividade' : 'Solicitação'; }
  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id') ?? ''; for (const s of this.sections) { this.forms[s.kind] = {}; this.editing[s.kind] = null; } this.load(); }
  private fail(e: HttpErrorResponse) { this.notice.set(''); this.error.set(apiMessages(e, 'A operação não foi concluída.')); }
  private ok(message: string) { this.error.set(''); this.notice.set(message); }
  load() { this.http.get<Detail>(`/api/admin/templates/${this.id}`).subscribe({ next: (d) => this.d.set(d), error: (e: HttpErrorResponse) => this.fail(e) }); }
  togglePreview() { if (this.preview()) { this.preview.set(null); return; } this.http.get<Preview>(`/api/admin/templates/${this.id}/preview`).subscribe({ next: (p) => this.preview.set(p), error: (e: HttpErrorResponse) => this.fail(e) }); }
  validate() { this.http.post<Validation>(`/api/admin/templates/${this.id}/validate`, {}).subscribe({ next: (v) => { this.validation.set(v); this.ok(v.valid ? 'Template válido.' : 'Template com erros; corrija antes de ativar.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  activate() { this.http.post(`/api/admin/templates/${this.id}/activate`, { inactivatePrevious: this.inactivatePrevious }).subscribe({ next: () => { this.validation.set(null); this.ok('Template ativado.'); this.load(); }, error: (e: HttpErrorResponse) => { this.fail(e); this.validate(); } }); }
  newVersion() { this.http.post<{ id: string }>(`/api/admin/templates/${this.id}/new-version`, {}).subscribe({ next: (t) => { void this.router.navigate(['/admin/templates', t.id]).then(() => { this.id = t.id; this.validation.set(null); this.preview.set(null); this.ok('Nova versão criada como rascunho.'); this.load(); }); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  post(action: string, message: string) { this.http.post(`/api/admin/templates/${this.id}/${action}`, {}).subscribe({ next: () => { this.ok(message); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  archive() { if (!window.confirm('Arquivar este template? Ele deixa de aparecer para novos projetos; projetos existentes continuam funcionando.')) return; this.post('archive', 'Template arquivado.'); }
  edit(s: Section, row: Row) { this.editing[s.kind] = row.id; const form: Record<string, unknown> = {}; for (const f of s.fields) form[f.name] = row[f.name] ?? ''; if (s.parent) form[s.parent] = row[s.parent]; this.forms[s.kind] = form; }
  reset(s: Section) { this.editing[s.kind] = null; this.forms[s.kind] = {}; }
  save(s: Section) {
    const body: Record<string, unknown> = {};
    for (const f of s.fields) { const value = this.forms[s.kind][f.name]; if (value === undefined || value === '') { if (this.editing[s.kind] && (f.type === 'int' || f.type === 'number' || f.name === 'description')) body[f.name] = null; continue; } body[f.name] = f.type === 'int' || f.type === 'number' ? Number(value) : value; }
    const editingId = this.editing[s.kind];
    if (editingId) { for (const key of Object.keys(body)) if (body[key] === null && !['plannedClientHours', 'relativeDueDays', 'description'].includes(key)) delete body[key]; }
    else if (s.parent) body[s.parent] = this.forms[s.kind][s.parent];
    const url = `/api/admin/templates/${this.id}/items/${s.kind}`;
    const request = editingId ? this.http.patch(`${url}/${editingId}`, body) : this.http.post(url, body);
    request.subscribe({ next: () => { this.reset(s); this.validation.set(null); this.ok('Item salvo. Valide o template antes de ativar.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  remove(s: Section, row: Row) { if (!window.confirm('Remover este item do rascunho?')) return; this.http.delete(`/api/admin/templates/${this.id}/items/${s.kind}/${row.id}`).subscribe({ next: () => { this.validation.set(null); this.ok('Item removido.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
}
