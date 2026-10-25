import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { roleLabels } from './auth.service';
import { projectStatusLabels } from './dashboard.types';
import { apiMessages } from './password-pages.component';

// Administração operacional (Etapa 10A). O backend aplica todas as regras (somente JGM4_ADMIN); aqui só há a interface.
const ROLE_OPTIONS = ['JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_SPONSOR', 'CLIENT_MANAGER', 'CLIENT_USER'];
const PROJECT_ROLE_LABELS: Record<string, string> = { CONSULTANT_LEAD: 'Consultor principal', CLIENT_SPONSOR: 'Patrocinador', CLIENT_MANAGER: 'Gestor do cliente', TEAM_MEMBER: 'Membro da equipe' };
const PROJECT_ROLES = Object.keys(PROJECT_ROLE_LABELS);
const isClientRole = (role: string) => role.startsWith('CLIENT_');
interface Company { id: string; name: string; displayName: string | null; internalCode: string | null; notes: string | null; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string; projects: number; users: number }
interface AdminUser { id: string; name: string; email: string; role: string; company: string | null; companyId: string | null; status: string; statusReason: string | null; lastLoginAt: string | null; locked: boolean; memberships: { id: string; project: string; roleInProject: string | null; active: boolean }[] }
interface AdminProject { id: string; code: string | null; name: string; status: string; company: string; companyId: string; companyActive: boolean; currentPhase: string | null; hasStructure: boolean; consultant: string | null; sponsor: string | null; manager: string | null; activeUsers: number; progress: number; plannedStartDate: string | null; plannedEndDate: string | null }

@Component({
  selector: 'app-admin-nav', imports: [RouterLink, RouterLinkActive],
  template: `<nav class="admin-nav" aria-label="Administração" data-testid="admin-nav">
    <a routerLink="/admin/companies" routerLinkActive="active" data-testid="admin-tab-companies">Empresas</a><a routerLink="/admin/users" routerLinkActive="active" data-testid="admin-tab-users">Usuários</a>
    <a routerLink="/admin/projects" routerLinkActive="active" data-testid="admin-tab-projects">Projetos</a><a routerLink="/admin/templates" routerLinkActive="active" data-testid="admin-tab-templates">Templates</a><a routerLink="/admin/security" routerLinkActive="active" data-testid="admin-tab-security">Segurança</a></nav>`,
})
export class AdminNavComponent {}

const feedback = `@if (notice()) { <p class="success-note" role="status" data-testid="admin-notice">{{ notice() }}</p> }@if (error()) { <p class="error-note" role="alert" data-testid="admin-error">{{ error() }}</p> }`;
const confirmBox = `<section class="panel" data-testid="confirm-panel"><h2>Confirmação para ações críticas</h2><p class="muted-copy">Sua senha (e o código MFA, se ativo) é pedida para inativar empresas, alterar perfis e remover vínculos.</p>
  <div class="form-grid"><label>Sua senha<input type="password" autocomplete="current-password" [(ngModel)]="reauth.password" data-testid="admin-password"></label><label>Código MFA<input maxlength="8" [(ngModel)]="reauth.code"></label></div></section>`;

abstract class AdminPage {
  protected readonly http = inject(HttpClient);
  readonly notice = signal(''); readonly error = signal('');
  reauth = { password: '', code: '' };
  role(role: string) { return roleLabels[role] ?? role; }
  protected critical() { return { confirmPassword: this.reauth.password, ...(this.reauth.code ? { mfaCode: this.reauth.code } : {}) }; }
  protected fail(e: HttpErrorResponse) { this.notice.set(''); this.error.set(apiMessages(e, 'A operação não foi concluída.')); }
  protected ok(message: string) { this.error.set(''); this.notice.set(message); }
}

// ------------------------------------------------------------------------------------------------------------------ empresas
@Component({
  selector: 'app-admin-companies', imports: [FormsModule, DatePipe, AdminNavComponent],
  template: `<main class="account-page"><div class="page-heading"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Empresas</h1></div><button type="button" (click)="startCreate()" data-testid="company-new">Nova empresa</button></div>
    <app-admin-nav />${feedback}${confirmBox}
    @if (editing(); as form) { <section class="panel" data-testid="company-form"><h2>{{ form.id ? 'Editar empresa' : 'Nova empresa' }}</h2>
      <form class="task-form inline-form" (ngSubmit)="save()"><div class="form-grid">
        <label>Razão / nome<input name="name" required minlength="2" maxlength="160" [(ngModel)]="form.name" data-testid="company-name"></label>
        <label>Nome de exibição<input name="displayName" maxlength="160" [(ngModel)]="form.displayName" data-testid="company-display"></label>
        <label>Identificação interna<input name="internalCode" maxlength="60" [(ngModel)]="form.internalCode" data-testid="company-code"></label></div>
        <label>Observações<textarea name="notes" rows="2" maxlength="2000" [(ngModel)]="form.notes"></textarea></label>
        <div class="action-buttons"><button type="submit" data-testid="company-save">Salvar</button><button type="button" class="secondary" (click)="editing.set(null)">Cancelar</button></div></form></section> }
    <section class="panel" data-testid="companies-panel"><div class="form-grid"><label>Buscar<input [(ngModel)]="filters.q" (ngModelChange)="load()" placeholder="Nome ou código" data-testid="company-search"></label>
      <label>Situação<select [(ngModel)]="filters.status" (ngModelChange)="load()"><option value="">Todas</option><option value="ACTIVE">Ativas</option><option value="INACTIVE">Inativas</option></select></label></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Empresa</th><th>Código</th><th>Situação</th><th>Projetos</th><th>Usuários</th><th>Atualizada</th><th></th></tr></thead><tbody>
      @for (c of companies(); track c.id) { <tr data-testid="company-row"><td data-label="Empresa">{{ c.name }}<small>{{ c.displayName || '' }}</small></td><td data-label="Código">{{ c.internalCode || '—' }}</td><td data-label="Situação">{{ c.status === 'ACTIVE' ? 'Ativa' : 'Inativa' }}</td>
        <td data-label="Projetos">{{ c.projects }}</td><td data-label="Usuários">{{ c.users }}</td><td data-label="Atualizada">{{ c.updatedAt | date:'dd/MM/yyyy' }}</td>
        <td class="row-actions"><button type="button" class="quiet-button" (click)="edit(c)">Editar</button><button type="button" class="quiet-button" (click)="toggle(c)" [attr.data-testid]="'company-toggle-' + c.name">{{ c.status === 'ACTIVE' ? 'Inativar' : 'Reativar' }}</button></td></tr>
      } @empty { <tr><td colspan="7" class="empty-row">Nenhuma empresa.</td></tr> }</tbody></table></div></section></main>`,
})
export class AdminCompaniesComponent extends AdminPage implements OnInit {
  readonly companies = signal<Company[]>([]); readonly editing = signal<{ id?: string; name: string; displayName: string; internalCode: string; notes: string } | null>(null);
  filters = { q: '', status: '' };
  ngOnInit() { this.load(); }
  load() { const q = new URLSearchParams(Object.entries(this.filters).filter(([, v]) => v)); this.http.get<Company[]>(`/api/admin/companies?${q}`).subscribe({ next: (rows) => this.companies.set(rows), error: (e: HttpErrorResponse) => this.fail(e) }); }
  startCreate() { this.editing.set({ name: '', displayName: '', internalCode: '', notes: '' }); }
  edit(c: Company) { this.editing.set({ id: c.id, name: c.name, displayName: c.displayName ?? '', internalCode: c.internalCode ?? '', notes: c.notes ?? '' }); }
  save() {
    const form = this.editing(); if (!form) return; const { id, ...body } = form;
    const request = id ? this.http.patch(`/api/admin/companies/${id}`, body) : this.http.post('/api/admin/companies', body);
    request.subscribe({ next: () => { this.editing.set(null); this.ok(id ? 'Empresa atualizada.' : 'Empresa criada.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  toggle(c: Company) {
    const status = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const reason = window.prompt(`Motivo para ${status === 'INACTIVE' ? 'inativar' : 'reativar'} ${c.name}:`); if (!reason) return;
    this.http.patch(`/api/admin/companies/${c.id}/status`, { status, reason, ...this.critical() }).subscribe({ next: () => { this.ok(status === 'INACTIVE' ? 'Empresa inativada: os usuários do cliente não autenticam mais; projetos e histórico foram preservados.' : 'Empresa reativada.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
}

// ------------------------------------------------------------------------------------------------------------------ usuários
@Component({
  selector: 'app-admin-users', imports: [FormsModule, DatePipe, AdminNavComponent],
  template: `<main class="account-page"><div class="page-heading"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Usuários</h1></div><button type="button" (click)="creating.set(!creating())" data-testid="user-new">Novo usuário</button></div>
    <app-admin-nav />${feedback}${confirmBox}
    @if (devLink()) { <p class="success-note" data-testid="user-dev-link">Link de definição de senha (somente desenvolvimento; uso único): <code class="break">{{ devLink() }}</code></p> }
    @if (creating()) { <section class="panel" data-testid="user-form"><h2>Novo usuário (convite)</h2><p class="muted-copy">Nenhuma senha é definida aqui: o usuário recebe um link de uso único para criar a própria senha.</p>
      <form class="task-form inline-form" (ngSubmit)="create()"><div class="form-grid">
        <label>Nome<input name="name" required minlength="2" [(ngModel)]="form.name" data-testid="user-name"></label>
        <label>E-mail<input type="email" name="email" required [(ngModel)]="form.email" data-testid="user-email"></label>
        <label>Perfil<select name="role" [(ngModel)]="form.role" data-testid="user-role">@for (r of roles; track r) { <option [value]="r">{{ role(r) }}</option> }</select></label>
        @if (isClient(form.role)) { <label>Empresa<select name="companyId" required [(ngModel)]="form.companyId" data-testid="user-company"><option value="">Selecione…</option>@for (c of activeCompanies(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></label> }</div>
        <div class="action-buttons"><button type="submit" data-testid="user-save">Criar e enviar convite</button><button type="button" class="secondary" (click)="creating.set(false)">Cancelar</button></div></form></section> }
    <section class="panel" data-testid="users-panel"><div class="form-grid">
      <label>Buscar<input [(ngModel)]="filters.q" (ngModelChange)="load()" placeholder="Nome ou e-mail" data-testid="user-search"></label>
      <label>Empresa<select [(ngModel)]="filters.companyId" (ngModelChange)="load()"><option value="">Todas</option>@for (c of companies(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></label>
      <label>Perfil<select [(ngModel)]="filters.role" (ngModelChange)="load()"><option value="">Todos</option>@for (r of roles; track r) { <option [value]="r">{{ role(r) }}</option> }</select></label>
      <label>Situação<select [(ngModel)]="filters.status" (ngModelChange)="load()"><option value="">Todas</option><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="BLOCKED">Bloqueado</option></select></label></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último login</th><th>Vínculos</th><th>Ações</th></tr></thead><tbody>
      @for (u of users(); track u.id) { <tr data-testid="user-row"><td data-label="Usuário">{{ u.name }}<small>{{ u.email }}{{ u.company ? ' · ' + u.company : '' }}</small></td>
        <td data-label="Perfil">{{ role(u.role) }}</td><td data-label="Situação">{{ statusLabel(u.status) }}{{ u.locked ? ' (travada)' : '' }}<small>{{ u.statusReason || '' }}</small></td>
        <td data-label="Último login">{{ u.lastLoginAt ? (u.lastLoginAt | date:'dd/MM/yyyy HH:mm') : 'Nunca' }}</td>
        <td data-label="Vínculos">@for (m of u.memberships; track m.id) { @if (m.active) { <small>{{ m.project }} ({{ m.roleInProject || '—' }})</small> } } @empty { — }</td>
        <td class="row-actions"><button type="button" class="quiet-button" (click)="rename(u)">Renomear</button>
          @if (u.status === 'ACTIVE') { <button type="button" class="quiet-button" (click)="setStatus(u, 'INACTIVE')" [attr.data-testid]="'user-disable-' + u.email">Inativar</button><button type="button" class="quiet-button" (click)="setStatus(u, 'BLOCKED')">Bloquear</button> }
          @else { <button type="button" class="quiet-button" (click)="setStatus(u, 'ACTIVE')">{{ u.status === 'BLOCKED' ? 'Desbloquear' : 'Reativar' }}</button> }
          <button type="button" class="quiet-button" (click)="changeRole(u)">Alterar perfil</button><button type="button" class="quiet-button" (click)="resetAccess(u)">Enviar acesso</button>@if (u.locked) { <button type="button" class="quiet-button" (click)="unlock(u)">Destravar</button> }</td></tr>
      } @empty { <tr><td colspan="6" class="empty-row">Nenhum usuário.</td></tr> }</tbody></table></div></section></main>`,
})
export class AdminUsersComponent extends AdminPage implements OnInit {
  readonly users = signal<AdminUser[]>([]); readonly companies = signal<Company[]>([]); readonly creating = signal(false); readonly devLink = signal(''); readonly roles = ROLE_OPTIONS;
  filters = { q: '', companyId: '', role: '', status: '' }; form = { name: '', email: '', role: 'CLIENT_USER', companyId: '' };
  isClient = isClientRole; activeCompanies() { return this.companies().filter((c) => c.status === 'ACTIVE'); }
  statusLabel(status: string) { return status === 'ACTIVE' ? 'Ativo' : status === 'BLOCKED' ? 'Bloqueado' : 'Inativo'; }
  ngOnInit() { this.http.get<Company[]>('/api/admin/companies').subscribe((rows) => this.companies.set(rows)); this.load(); }
  load() { const q = new URLSearchParams(Object.entries(this.filters).filter(([, v]) => v)); this.http.get<AdminUser[]>(`/api/admin/users?${q}`).subscribe({ next: (rows) => this.users.set(rows), error: (e: HttpErrorResponse) => this.fail(e) }); }
  private done(message: string, link?: string) { this.ok(message); this.devLink.set(link ?? ''); this.load(); }
  create() {
    const body = { name: this.form.name, email: this.form.email, role: this.form.role, ...(isClientRole(this.form.role) ? { companyId: this.form.companyId } : {}) };
    this.http.post<{ devLink?: string }>('/api/admin/users', body).subscribe({ next: (r) => { this.creating.set(false); this.form = { name: '', email: '', role: 'CLIENT_USER', companyId: '' }; this.done('Usuário criado; o convite foi enviado por e-mail.', r.devLink); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  rename(u: AdminUser) { const name = window.prompt('Novo nome:', u.name); if (!name || name === u.name) return; this.http.patch(`/api/admin/users/${u.id}`, { name }).subscribe({ next: () => this.done('Nome atualizado.'), error: (e: HttpErrorResponse) => this.fail(e) }); }
  setStatus(u: AdminUser, status: string) {
    const reason = window.prompt(`Motivo para alterar ${u.name} para ${this.statusLabel(status)}:`); if (!reason) return;
    this.http.patch(`/api/admin/users/${u.id}/status`, { status, reason, ...this.critical() }).subscribe({ next: () => this.done('Situação atualizada; as sessões do usuário foram encerradas quando aplicável.'), error: (e: HttpErrorResponse) => this.fail(e) });
  }
  changeRole(u: AdminUser) {
    const role = window.prompt(`Novo perfil para ${u.name} (${this.roles.join(', ')}):`, u.role); if (!role || role === u.role) return;
    const reason = window.prompt('Motivo da alteração de perfil:'); if (!reason) return;
    this.http.patch(`/api/admin/users/${u.id}/role`, { role, reason, ...this.critical() }).subscribe({ next: () => this.done('Perfil alterado e registrado na auditoria.'), error: (e: HttpErrorResponse) => this.fail(e) });
  }
  resetAccess(u: AdminUser) { this.http.post<{ devLink?: string }>(`/api/admin/users/${u.id}/reset-access`, {}).subscribe({ next: (r) => this.done('Link de acesso enviado por e-mail.', r.devLink), error: (e: HttpErrorResponse) => this.fail(e) }); }
  unlock(u: AdminUser) { this.http.post(`/api/admin/users/${u.id}/unlock`, {}).subscribe({ next: () => this.done('Conta destravada.'), error: (e: HttpErrorResponse) => this.fail(e) }); }
}

// ------------------------------------------------------------------------------------------------------------------ projetos
@Component({
  selector: 'app-admin-projects', imports: [FormsModule, RouterLink, AdminNavComponent],
  template: `<main class="account-page"><div class="page-heading"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Projetos</h1></div><button type="button" (click)="creating.set(!creating())" data-testid="project-new">Novo projeto</button></div>
    <app-admin-nav />${feedback}
    @if (creating()) { <section class="panel" data-testid="project-form"><h2>Novo projeto</h2>
      <form class="task-form inline-form" (ngSubmit)="create()"><div class="form-grid">
        <label>Cliente<select name="companyId" required [(ngModel)]="form.companyId" data-testid="project-company"><option value="">Selecione…</option>@for (c of activeCompanies(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></label>
        <label>Nome<input name="name" required minlength="3" [(ngModel)]="form.name" data-testid="project-name"></label>
        <label>Código<input name="code" maxlength="40" [(ngModel)]="form.code" data-testid="project-code"></label>
        <label>Início planejado<input type="date" name="plannedStartDate" [(ngModel)]="form.plannedStartDate"></label><label>Término planejado<input type="date" name="plannedEndDate" [(ngModel)]="form.plannedEndDate"></label>
        <label>Situação inicial<select name="status" [(ngModel)]="form.status"><option value="PLANNING">Planejamento</option><option value="IN_PROGRESS">Em andamento</option></select></label>
        <label>Consultor principal<select name="consultantUserId" [(ngModel)]="form.consultantUserId" data-testid="project-consultant"><option value="">—</option>@for (u of byRole(['JGM4_CONSULTANT','JGM4_ADMIN']); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></label>
        <label>Patrocinador do cliente<select name="sponsorUserId" [(ngModel)]="form.sponsorUserId" data-testid="project-sponsor"><option value="">—</option>@for (u of clientUsers(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></label>
        <label>Gestor do cliente<select name="managerUserId" [(ngModel)]="form.managerUserId" data-testid="project-manager"><option value="">—</option>@for (u of clientUsers(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></label></div>
        <label>Descrição<textarea name="description" rows="2" required minlength="3" [(ngModel)]="form.description" data-testid="project-description"></textarea></label>
        <label>Estrutura<select name="templateId" [(ngModel)]="form.templateId" data-testid="project-template"><option value="">Começar sem template</option>@for (t of templates(); track t.id) { <option [value]="t.id">{{ t.name }} — v{{ t.version }} ({{ t.phases }} fases, {{ t.tasks }} atividades, {{ t.gates }} Gates)</option> }</select></label>
        <div class="action-buttons"><button type="submit" data-testid="project-save">Criar projeto</button><button type="button" class="secondary" (click)="creating.set(false)">Cancelar</button></div></form></section> }
    <section class="panel" data-testid="projects-panel"><div class="form-grid">
      <label>Buscar<input [(ngModel)]="filters.q" (ngModelChange)="load()" placeholder="Nome ou código" data-testid="project-search"></label>
      <label>Cliente<select [(ngModel)]="filters.companyId" (ngModelChange)="load()"><option value="">Todos</option>@for (c of companies(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></label>
      <label>Situação<select [(ngModel)]="filters.status" (ngModelChange)="load()"><option value="">Todas</option>@for (s of statuses; track s) { <option [value]="s">{{ label(s) }}</option> }</select></label>
      <label>Consultor<select [(ngModel)]="filters.consultantId" (ngModelChange)="load()"><option value="">Todos</option>@for (u of byRole(['JGM4_CONSULTANT','JGM4_ADMIN']); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></label>
      <label>Fase atual<select [(ngModel)]="filters.phase" (ngModelChange)="load()"><option value="">Todas</option>@for (n of [0,1,2,3,4]; track n) { <option [value]="n">Fase {{ n }}</option> }</select></label></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Cliente / projeto</th><th>Situação</th><th>Fase atual</th><th>Consultor</th><th>Patrocinador</th><th>Gestor</th><th>Usuários</th><th>Progresso</th><th></th></tr></thead><tbody>
      @for (p of projects(); track p.id) { <tr data-testid="project-row"><td data-label="Projeto">{{ p.name }}<small>{{ p.company }}{{ p.code ? ' · ' + p.code : '' }}{{ p.companyActive ? '' : ' (empresa inativa)' }}</small></td>
        <td data-label="Situação">{{ label(p.status) }}</td><td data-label="Fase">{{ p.currentPhase || (p.hasStructure ? '—' : 'Sem estrutura') }}</td>
        <td data-label="Consultor">{{ p.consultant || '—' }}</td><td data-label="Patrocinador">{{ p.sponsor || '—' }}</td><td data-label="Gestor">{{ p.manager || '—' }}</td><td data-label="Usuários">{{ p.activeUsers }}</td><td data-label="Progresso">{{ p.progress }}%</td>
        <td class="row-actions"><a class="quiet-button" [routerLink]="['/admin/projects', p.id, 'members']" [attr.data-testid]="'project-members-' + p.name">Membros</a>
          @if (p.hasStructure) { <a class="quiet-button" [routerLink]="['/projects', p.id, 'plan']" [attr.data-testid]="'project-open-' + p.name">Abrir</a> } @else { <select class="inline-select" [(ngModel)]="pick[p.id]" aria-label="Template" [attr.data-testid]="'project-template-pick-' + p.name"><option value="">Template…</option>@for (t of templates(); track t.id) { <option [value]="t.id">{{ t.name }} v{{ t.version }}</option> }</select><button type="button" class="quiet-button" (click)="applyTemplate(p)" [disabled]="!pick[p.id]" [attr.data-testid]="'project-apply-' + p.name">Usar template</button> }
          @if (p.status === 'PLANNING' || p.status === 'PLANNED') { <button type="button" class="quiet-button" (click)="activate(p)">Ativar</button> }
          <a class="quiet-button" [routerLink]="['/projects', p.id, 'manage']">Gestão</a></td></tr>
      } @empty { <tr><td colspan="9" class="empty-row">Nenhum projeto.</td></tr> }</tbody></table></div></section></main>`,
})
export class AdminProjectsComponent extends AdminPage implements OnInit {
  readonly projects = signal<AdminProject[]>([]); readonly companies = signal<Company[]>([]); readonly users = signal<AdminUser[]>([]); readonly creating = signal(false);
  readonly statuses = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'IMPLEMENTATION_COMPLETED', 'CANCELLED'];
  filters = { q: '', companyId: '', status: '', consultantId: '', phase: '' };
  form = { companyId: '', name: '', code: '', description: '', plannedStartDate: '', plannedEndDate: '', status: 'PLANNING', consultantUserId: '', sponsorUserId: '', managerUserId: '', templateId: '' };
  readonly templates = signal<{ id: string; name: string; version: number; phases: number; tasks: number; gates: number }[]>([]); pick: Record<string, string> = {};
  label(status: string) { return projectStatusLabels[status] ?? status; }
  activeCompanies() { return this.companies().filter((c) => c.status === 'ACTIVE'); }
  byRole(roles: string[]) { return this.users().filter((u) => roles.includes(u.role) && u.status === 'ACTIVE'); }
  clientUsers() { return this.users().filter((u) => isClientRole(u.role) && u.status === 'ACTIVE' && u.companyId === this.form.companyId); }
  ngOnInit() { this.http.get<Company[]>('/api/admin/companies').subscribe((rows) => this.companies.set(rows)); this.http.get<AdminUser[]>('/api/admin/users').subscribe((rows) => this.users.set(rows)); this.http.get<never[]>('/api/templates/active').subscribe((rows) => this.templates.set(rows)); this.load(); }
  load() { const q = new URLSearchParams(Object.entries(this.filters).filter(([, v]) => v !== '')); this.http.get<AdminProject[]>(`/api/admin/projects?${q}`).subscribe({ next: (rows) => this.projects.set(rows), error: (e: HttpErrorResponse) => this.fail(e) }); }
  create() {
    const body = Object.fromEntries(Object.entries(this.form).filter(([, v]) => v !== ''));
    this.http.post('/api/admin/projects', body).subscribe({ next: () => { this.creating.set(false); this.form = { companyId: '', name: '', code: '', description: '', plannedStartDate: '', plannedEndDate: '', status: 'PLANNING', consultantUserId: '', sponsorUserId: '', managerUserId: '', templateId: '' }; this.ok('Projeto criado.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  applyTemplate(p: AdminProject) {
    if (!this.pick[p.id] || !window.confirm(`Aplicar o template escolhido ao projeto "${p.name}"? Será criada uma cópia da estrutura (fases, Gates, atividades e solicitações).`)) return;
    this.http.post(`/api/admin/projects/${p.id}/apply-template`, { templateId: this.pick[p.id] }).subscribe({ next: () => { this.ok('Estrutura do template aplicada.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  activate(p: AdminProject) {
    const reason = window.prompt(`Motivo/registro para ativar "${p.name}":`, 'Início acordado com o cliente'); if (!reason) return;
    this.http.post(`/api/admin/projects/${p.id}/activate`, { reason }).subscribe({ next: () => { this.ok('Projeto ativado.'); this.load(); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
}

// ------------------------------------------------------------------------------------------------------------------ vínculos do projeto
interface Member { membershipId: string; userId: string; name: string; email: string; role: string; userStatus: string; company: string | null; roleInProject: string | null; active: boolean }
@Component({
  selector: 'app-admin-project-members', imports: [FormsModule, RouterLink, AdminNavComponent],
  template: `<main class="account-page"><div class="page-heading"><div><p class="eyebrow">ADMINISTRAÇÃO · PROJETO</p><h1>{{ project()?.name || 'Membros do projeto' }}</h1><p class="lead">{{ project()?.company }} · responsabilidades e vínculos</p></div><a class="btn secondary" routerLink="/admin/projects">Voltar aos projetos</a></div>
    <app-admin-nav />${feedback}${confirmBox}
    <section class="panel" data-testid="members-add-panel"><h2>Adicionar usuário</h2><div class="form-grid">
      <label>Usuário<select [(ngModel)]="add.userId" data-testid="member-user"><option value="">Selecione…</option>@for (u of eligible(); track u.id) { <option [value]="u.id">{{ u.name }} — {{ role(u.role) }}</option> }</select></label>
      <label>Responsabilidade<select [(ngModel)]="add.roleInProject" data-testid="member-role">@for (r of projectRoles; track r) { <option [value]="r">{{ projectRoleLabels[r] }}</option> }</select></label></div>
      <button type="button" (click)="addMember()" [disabled]="!add.userId" data-testid="member-add">Vincular ao projeto</button></section>
    <section class="panel" data-testid="members-panel"><h2>Membros</h2><div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Responsabilidade no projeto</th><th>Situação</th><th></th></tr></thead><tbody>
      @for (m of members(); track m.membershipId) { <tr data-testid="member-row"><td data-label="Usuário">{{ m.name }}<small>{{ m.email }}{{ m.company ? ' · ' + m.company : '' }}</small></td><td data-label="Perfil">{{ role(m.role) }}</td>
        <td data-label="Responsabilidade">@if (m.active) { <select [ngModel]="m.roleInProject" (ngModelChange)="changeRole(m, $event)" aria-label="Responsabilidade">@for (r of projectRoles; track r) { <option [value]="r">{{ projectRoleLabels[r] }}</option> }</select> } @else { — }</td>
        <td data-label="Situação">{{ m.active ? 'Ativo' : 'Removido' }}</td><td>@if (m.active) { <button type="button" class="quiet-button" (click)="remove(m)" [attr.data-testid]="'member-remove-' + m.email">Remover vínculo</button> } @else { <button type="button" class="quiet-button" (click)="reactivate(m)">Reativar</button> }</td></tr>
      } @empty { <tr><td colspan="5" class="empty-row">Nenhum membro.</td></tr> }</tbody></table></div></section></main>`,
})
export class AdminProjectMembersComponent extends AdminPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly members = signal<Member[]>([]); readonly users = signal<AdminUser[]>([]); readonly project = signal<AdminProject | null>(null);
  readonly projectRoles = PROJECT_ROLES; readonly projectRoleLabels = PROJECT_ROLE_LABELS; projectId = ''; add = { userId: '', roleInProject: 'TEAM_MEMBER' };
  eligible() {
    const taken = new Set(this.members().filter((m) => m.active).map((m) => m.userId)); const company = this.project()?.companyId;
    return this.users().filter((u) => u.status === 'ACTIVE' && !taken.has(u.id) && (!isClientRole(u.role) || u.companyId === company));
  }
  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    this.http.get<AdminProject[]>('/api/admin/projects').subscribe((rows) => this.project.set(rows.find((p) => p.id === this.projectId) ?? null));
    this.http.get<AdminUser[]>('/api/admin/users').subscribe((rows) => this.users.set(rows)); this.load();
  }
  load() { this.http.get<Member[]>(`/api/admin/projects/${this.projectId}/members`).subscribe({ next: (rows) => this.members.set(rows), error: (e: HttpErrorResponse) => this.fail(e) }); }
  private done(message: string) { this.ok(message); this.load(); }
  addMember() { this.http.post(`/api/admin/projects/${this.projectId}/members`, this.add).subscribe({ next: () => { this.add = { userId: '', roleInProject: 'TEAM_MEMBER' }; this.done('Vínculo criado.'); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  changeRole(m: Member, roleInProject: string) { this.http.patch(`/api/admin/projects/${this.projectId}/members/${m.membershipId}`, { roleInProject }).subscribe({ next: () => this.done('Responsabilidade atualizada.'), error: (e: HttpErrorResponse) => { this.fail(e); this.load(); } }); }
  remove(m: Member) { this.http.patch(`/api/admin/projects/${this.projectId}/members/${m.membershipId}`, { active: false, ...this.critical() }).subscribe({ next: () => this.done('Vínculo removido (histórico preservado).'), error: (e: HttpErrorResponse) => this.fail(e) }); }
  reactivate(m: Member) { this.http.post(`/api/admin/projects/${this.projectId}/members`, { userId: m.userId, roleInProject: m.roleInProject && PROJECT_ROLES.includes(m.roleInProject) ? m.roleInProject : 'TEAM_MEMBER' }).subscribe({ next: () => this.done('Vínculo reativado.'), error: (e: HttpErrorResponse) => this.fail(e) }); }
}
