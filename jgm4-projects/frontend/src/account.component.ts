import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService, landingPath, roleLabels } from './auth.service';
import { apiMessages, passwordPolicyText } from './password-pages.component';

interface SessionRow { id: string; current: boolean; createdAt: string; lastUsedAt: string; expiresAt: string; ip: string | null; userAgent: string | null }

@Component({
  selector: 'app-account', imports: [DatePipe, FormsModule],
  template: `<main class="account-page">
    <div class="page-heading"><div><p class="eyebrow">MINHA CONTA</p><h1>Segurança da conta</h1>
      @if (auth.user(); as u) { <p class="lead">{{ u.name }} · {{ role(u.role) }}{{ u.company ? ' · ' + u.company.name : '' }} · {{ u.email }}</p> }</div></div>
    @if (auth.user()?.restricted === 'PASSWORD_CHANGE_REQUIRED') { <p class="role-banner" role="alert" data-testid="required-password">Por segurança, defina uma nova senha para continuar.</p> }
    @if (auth.user()?.restricted === 'MFA_SETUP_REQUIRED') { <p class="role-banner" role="alert" data-testid="required-mfa">Administradores precisam ativar a verificação em duas etapas para continuar.</p> }
    @if (notice()) { <p class="success-note" role="status" data-testid="account-notice">{{ notice() }}</p> }
    @if (error()) { <p class="error-note" role="alert" data-testid="account-error">{{ error() }}</p> }

    <section class="panel" data-testid="password-panel"><h2>Alterar senha</h2><p class="muted-copy">{{ policy }}</p>
      <form class="task-form inline-form" (ngSubmit)="changePassword()"><div class="form-grid">
        <label>Senha atual<input type="password" name="current" required autocomplete="current-password" [(ngModel)]="pw.current" data-testid="pw-current"></label>
        <label>Nova senha<input type="password" name="next" required minlength="10" autocomplete="new-password" [(ngModel)]="pw.next" data-testid="pw-new"></label></div>
        <button type="submit" [disabled]="busy()" data-testid="pw-submit">Alterar senha</button><small class="muted-copy"> As outras sessões são encerradas ao trocar a senha.</small></form></section>

    <section class="panel" data-testid="mfa-panel"><h2>Verificação em duas etapas (TOTP)</h2>
      @if (auth.user()?.mfaEnabled) { <p>Status: <strong>ativa</strong>. Um código do aplicativo autenticador será pedido a cada login.</p>
        <form class="task-form inline-form" (ngSubmit)="disableMfa()"><div class="form-grid"><label>Senha<input type="password" name="mpw" required [(ngModel)]="mfa.password"></label><label>Código atual<input name="mcode" required minlength="6" maxlength="8" [(ngModel)]="mfa.code"></label></div>
          <button type="submit" class="secondary danger" [disabled]="busy()">Desativar</button></form>
      } @else { <p>Status: <strong>desativada</strong>. Recomendado para todos; obrigatório para administradores em produção.</p>
        @if (!setup()) { <button type="button" (click)="startMfa()" data-testid="mfa-start">Configurar aplicativo autenticador</button> }
        @else { <div class="inline-form task-form"><p>1. No aplicativo autenticador, adicione uma conta <strong>manualmente</strong> com esta chave (ou abra o endereço <code>otpauth</code> em um leitor):</p>
          <p><code data-testid="mfa-secret">{{ setup()!.secret }}</code></p><p class="muted-copy break">{{ setup()!.otpauthUri }}</p>
          <label>2. Digite o código de 6 dígitos gerado<input name="enable" inputmode="numeric" maxlength="8" [(ngModel)]="mfa.code" data-testid="mfa-enable-code"></label>
          <button type="button" (click)="enableMfa()" [disabled]="busy()" data-testid="mfa-enable">Ativar</button></div> } }
    </section>

    <section class="panel" data-testid="sessions-panel"><div class="section-heading"><div><h2>Sessões ativas</h2></div><button type="button" class="secondary danger" (click)="logoutAll()" data-testid="logout-all">Encerrar todas as sessões</button></div>
      <div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Dispositivo / IP</th><th>Início</th><th>Última atividade</th><th></th></tr></thead><tbody>
        @for (s of sessions(); track s.id) { <tr><td data-label="Dispositivo">{{ s.userAgent || 'Desconhecido' }}<small>{{ s.ip || '—' }}{{ s.current ? ' · esta sessão' : '' }}</small></td><td data-label="Início">{{ s.createdAt | date:'dd/MM/yyyy HH:mm' }}</td><td data-label="Atividade">{{ s.lastUsedAt | date:'dd/MM/yyyy HH:mm' }}</td>
          <td>@if (!s.current) { <button type="button" class="quiet-button" (click)="revoke(s)">Encerrar</button> }</td></tr> } @empty { <tr><td colspan="4" class="empty-row">Nenhuma sessão.</td></tr> }</tbody></table></div>
    </section>
  </main>`,
})
export class AccountComponent implements OnInit {
  private readonly http = inject(HttpClient); readonly auth = inject(AuthService); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  readonly policy = passwordPolicyText; readonly sessions = signal<SessionRow[]>([]); readonly setup = signal<{ secret: string; otpauthUri: string } | null>(null);
  readonly busy = signal(false); readonly notice = signal(''); readonly error = signal('');
  pw = { current: '', next: '' }; mfa = { code: '', password: '' };
  role(role: string) { return roleLabels[role] ?? role; }
  ngOnInit() { this.loadSessions(); void this.destroyRef; }
  private loadSessions() { this.http.get<SessionRow[]>('/api/auth/sessions').subscribe({ next: (rows) => this.sessions.set(rows), error: () => this.sessions.set([]) }); }
  private fail(e: HttpErrorResponse) { this.busy.set(false); this.notice.set(''); this.error.set(apiMessages(e, 'A operação não foi concluída.')); }
  private ok(message: string) { this.busy.set(false); this.error.set(''); this.notice.set(message); this.auth.refreshUser().subscribe((user) => { if (!user.restricted && this.router.url.startsWith('/account') && this.pendingRedirect) { this.pendingRedirect = false; void this.router.navigateByUrl(landingPath(user)); } }); this.loadSessions(); }
  private pendingRedirect = false;
  changePassword() { this.busy.set(true); this.pendingRedirect = !!this.auth.user()?.restricted; this.http.post('/api/auth/change-password', { currentPassword: this.pw.current, newPassword: this.pw.next }).subscribe({ next: () => { this.pw = { current: '', next: '' }; this.ok('Senha alterada. As demais sessões foram encerradas.'); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  startMfa() { this.http.post<{ secret: string; otpauthUri: string }>('/api/auth/mfa/setup', {}).subscribe({ next: (value) => this.setup.set(value), error: (e: HttpErrorResponse) => this.fail(e) }); }
  enableMfa() { this.busy.set(true); this.pendingRedirect = !!this.auth.user()?.restricted; this.http.post('/api/auth/mfa/enable', { code: this.mfa.code }).subscribe({ next: () => { this.setup.set(null); this.mfa.code = ''; this.ok('Verificação em duas etapas ativada.'); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  disableMfa() { this.busy.set(true); this.http.post('/api/auth/mfa/disable', { password: this.mfa.password, code: this.mfa.code }).subscribe({ next: () => { this.mfa = { code: '', password: '' }; this.ok('Verificação em duas etapas desativada.'); }, error: (e: HttpErrorResponse) => this.fail(e) }); }
  revoke(session: SessionRow) { this.http.delete(`/api/auth/sessions/${session.id}`).subscribe({ next: () => this.ok('Sessão encerrada.'), error: (e: HttpErrorResponse) => this.fail(e) }); }
  logoutAll() { this.http.post('/api/auth/logout-all', {}).subscribe({ next: () => this.auth.expire(), error: (e: HttpErrorResponse) => this.fail(e) }); }
}
