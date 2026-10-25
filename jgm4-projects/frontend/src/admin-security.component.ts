import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { roleLabels } from './auth.service';
import { apiMessages } from './password-pages.component';
import { AdminNavComponent } from './admin-ops.components';

interface Membership { id: string; projectId: string; project: string; roleInProject: string | null; active: boolean }
interface AdminUser { id: string; name: string; email: string; role: string; company: string | null; status: string; mfaEnabled: boolean; mustChangePassword: boolean; lastLoginAt: string | null; locked: boolean; memberships: Membership[]; flags?: string[]; noLoginDays?: number | null }
interface SecEvent { id: string; type: string; at: string; user: string | null; ip: string | null }
interface Incident { id: string; title: string; status: string; createdAt: string; description: string }
interface ProjectRow { id: string; name: string }

const INCIDENT_STATUS = ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'];

// Administração de segurança (JGM4_ADMIN): usuários, vínculos com projetos, revisão de acessos, eventos de segurança e incidentes.
// Ações críticas pedem a senha do administrador (e o código MFA, quando ativo).
@Component({
  selector: 'app-admin-security', imports: [DatePipe, FormsModule, AdminNavComponent],
  template: `<main class="account-page">
    <div class="page-heading"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Segurança e acessos</h1><p class="lead">Usuários, vínculos com projetos, revisão de acessos, eventos de segurança e incidentes.</p></div></div>
    <app-admin-nav />
    @if (notice()) { <p class="success-note" role="status" data-testid="admin-notice">{{ notice() }}</p> }
    @if (error()) { <p class="error-note" role="alert" data-testid="admin-error">{{ error() }}</p> }

    <section class="panel" data-testid="confirm-panel"><h2>Confirmação para ações críticas</h2>
      <div class="form-grid"><label>Sua senha<input type="password" autocomplete="current-password" [(ngModel)]="reauth.password" data-testid="admin-password"></label><label>Código MFA (se ativo)<input maxlength="8" [(ngModel)]="reauth.code"></label></div></section>

    <section class="panel" data-testid="users-panel"><div class="section-heading"><div><h2>Usuários e revisão de acessos</h2></div><a class="btn secondary" href="/api/admin/access-review/xlsx" data-testid="access-xlsx">Exportar XLSX</a></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>MFA</th><th>Último login</th><th>Alertas</th><th>Ações</th></tr></thead><tbody>
        @for (u of users(); track u.id) { <tr><td data-label="Usuário">{{ u.name }}<small>{{ u.email }}{{ u.company ? ' · ' + u.company : '' }}</small></td><td data-label="Perfil">{{ role(u.role) }}</td><td data-label="Situação">{{ u.status }}{{ u.locked ? ' (travada)' : '' }}</td><td data-label="MFA">{{ u.mfaEnabled ? 'Sim' : 'Não' }}</td>
          <td data-label="Último login">{{ u.lastLoginAt ? (u.lastLoginAt | date:'dd/MM/yyyy HH:mm') : 'Nunca' }}</td><td data-label="Alertas">@for (f of u.flags ?? []; track f) { <small class="flag">{{ f }}</small> } @empty { — }</td>
          <td class="row-actions">
            @if (u.status === 'ACTIVE') { <button type="button" class="quiet-button" (click)="setStatus(u, 'INACTIVE')">Inativar</button><button type="button" class="quiet-button" (click)="setStatus(u, 'BLOCKED')">Bloquear</button> } @else { <button type="button" class="quiet-button" (click)="setStatus(u, 'ACTIVE')">Reativar</button> }
            <button type="button" class="quiet-button" (click)="revokeSessions(u)">Encerrar sessões</button>@if (u.locked) { <button type="button" class="quiet-button" (click)="unlock(u)">Destravar</button> }</td></tr> } @empty { <tr><td colspan="7" class="empty-row">Carregando…</td></tr> }</tbody></table></div></section>

    <section class="panel" data-testid="members-panel"><h2>Vínculos com projetos</h2>
      <div class="form-grid"><label>Projeto<select [(ngModel)]="memberProject" (ngModelChange)="loadMembers()" data-testid="members-project"><option value="">Selecione…</option>@for (p of projects(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></label>
        <label>Adicionar usuário<select [(ngModel)]="newMember" data-testid="members-user"><option value="">Selecione…</option>@for (u of eligible(); track u.id) { <option [value]="u.id">{{ u.name }} — {{ role(u.role) }}</option> }</select></label></div>
      <button type="button" (click)="addMember()" [disabled]="!memberProject || !newMember" data-testid="members-add">Vincular ao projeto</button>
      <ul class="history-list">@for (m of members(); track m.membershipId) { <li><div><strong>{{ m.name }}</strong><span>{{ role(m.role) }}{{ m.company ? ' · ' + m.company : '' }} · {{ m.active ? 'ativo' : 'inativo' }}</span></div>
        @if (m.active) { <button type="button" class="quiet-button" (click)="removeMember(m)">Remover vínculo</button> }</li> } @empty { <li class="muted-copy">Selecione um projeto.</li> }</ul></section>

    <section class="panel" data-testid="events-panel"><h2>Eventos de segurança recentes</h2>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Quando</th><th>Evento</th><th>Usuário</th><th>IP</th></tr></thead><tbody>
        @for (e of events(); track e.id) { <tr><td data-label="Quando">{{ e.at | date:'dd/MM/yyyy HH:mm:ss' }}</td><td data-label="Evento">{{ e.type }}</td><td data-label="Usuário">{{ e.user || '—' }}</td><td data-label="IP">{{ e.ip || '—' }}</td></tr> } @empty { <tr><td colspan="4" class="empty-row">Nenhum evento.</td></tr> }</tbody></table></div></section>

    <section class="panel" data-testid="incidents-panel"><h2>Incidentes de segurança</h2>
      <ul class="history-list">@for (i of incidents(); track i.id) { <li><div><strong>{{ i.title }}</strong><span>{{ i.status }} · {{ i.createdAt | date:'dd/MM/yyyy HH:mm' }}</span></div>
        <select [ngModel]="i.status" (ngModelChange)="updateIncident(i, $event)" aria-label="Situação do incidente">@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select></li> } @empty { <li class="muted-copy">Nenhum incidente registrado.</li> }</ul>
      <form class="task-form inline-form" (ngSubmit)="createIncident()"><h3>Registrar incidente</h3>
        <div class="form-grid"><label>Título<input name="title" required minlength="5" [(ngModel)]="incident.title" data-testid="incident-title"></label><label>Descrição<input name="description" required minlength="5" [(ngModel)]="incident.description" data-testid="incident-description"></label></div>
        <button type="submit" data-testid="incident-add">Registrar</button></form></section>
  </main>`,
})
export class AdminSecurityComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly users = signal<AdminUser[]>([]); readonly events = signal<SecEvent[]>([]); readonly incidents = signal<Incident[]>([]); readonly projects = signal<ProjectRow[]>([]);
  readonly members = signal<{ membershipId: string; userId: string; name: string; role: string; company: string | null; active: boolean }[]>([]);
  readonly notice = signal(''); readonly error = signal(''); readonly statuses = INCIDENT_STATUS;
  reauth = { password: '', code: '' }; memberProject = ''; newMember = ''; incident = { title: '', description: '' };
  role(role: string) { return roleLabels[role] ?? role; }
  eligible() { const taken = new Set(this.members().filter((m) => m.active).map((m) => m.userId)); return this.users().filter((u) => u.status === 'ACTIVE' && u.role !== 'JGM4_ADMIN' && !taken.has(u.id)); }
  ngOnInit() { this.reload(); this.http.get<ProjectRow[]>('/api/projects').subscribe({ next: (rows) => this.projects.set(rows), error: () => this.projects.set([]) }); }
  private fail(e: HttpErrorResponse) { this.notice.set(''); this.error.set(apiMessages(e, 'A operação não foi concluída.')); }
  private ok(message: string) { this.error.set(''); this.notice.set(message); this.reload(); }
  private critical() { return { confirmPassword: this.reauth.password, ...(this.reauth.code ? { mfaCode: this.reauth.code } : {}) }; }
  reload() {
    this.http.get<AdminUser[]>('/api/admin/access-review').subscribe({ next: (rows) => this.users.set(rows), error: (e: HttpErrorResponse) => this.fail(e) });
    this.http.get<{ items: SecEvent[] }>('/api/admin/security-events?limit=50').subscribe({ next: (r) => this.events.set(r.items), error: () => this.events.set([]) });
    this.http.get<Incident[]>('/api/admin/incidents').subscribe({ next: (rows) => this.incidents.set(rows), error: () => this.incidents.set([]) });
    if (this.memberProject) this.loadMembers();
  }
  loadMembers() { if (!this.memberProject) { this.members.set([]); return; } this.http.get<never[]>(`/api/projects/${this.memberProject}/members`).subscribe({ next: (rows) => this.members.set(rows), error: (e: HttpErrorResponse) => this.fail(e) }); }
  setStatus(user: AdminUser, status: string) {
    const reason = window.prompt(`Motivo para alterar ${user.name} para ${status}:`); if (!reason) return;
    this.http.patch(`/api/admin/users/${user.id}/status`, { status, reason, ...this.critical() }).subscribe({ next: () => this.ok('Situação do usuário atualizada.'), error: (e: HttpErrorResponse) => this.fail(e) });
  }
  revokeSessions(user: AdminUser) { this.http.post(`/api/admin/users/${user.id}/revoke-sessions`, {}).subscribe({ next: () => this.ok('Sessões encerradas.'), error: (e: HttpErrorResponse) => this.fail(e) }); }
  unlock(user: AdminUser) { this.http.post(`/api/admin/users/${user.id}/unlock`, {}).subscribe({ next: () => this.ok('Conta destravada.'), error: (e: HttpErrorResponse) => this.fail(e) }); }
  addMember() { this.http.post(`/api/projects/${this.memberProject}/members`, { userId: this.newMember }).subscribe({ next: () => { this.newMember = ''; this.ok('Vínculo criado.'); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  removeMember(member: { membershipId: string }) { this.http.patch(`/api/projects/${this.memberProject}/members/${member.membershipId}`, { active: false, ...this.critical() }).subscribe({ next: () => this.ok('Vínculo removido (histórico preservado).'), error: (e: HttpErrorResponse) => this.fail(e) }); }
  createIncident() { this.http.post('/api/admin/incidents', this.incident).subscribe({ next: () => { this.incident = { title: '', description: '' }; this.ok('Incidente registrado.'); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  updateIncident(incident: Incident, status: string) { const note = window.prompt('Registro da mudança de situação:'); if (!note) { this.reload(); return; } this.http.patch(`/api/admin/incidents/${incident.id}`, { status, note }).subscribe({ next: () => this.ok('Incidente atualizado.'), error: (e: HttpErrorResponse) => { this.fail(e); this.reload(); } }); }
}
