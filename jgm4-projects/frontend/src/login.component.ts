import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthLayoutComponent } from './ui/status-pages';
import { AlertComponent, FormFieldComponent } from './ui/ui.components';
import { AuthService, SessionUser, landingPath } from './auth.service';

@Component({
  selector: 'app-login', imports: [FormsModule, RouterLink, AuthLayoutComponent, FormFieldComponent, AlertComponent],
  template: `<ui-auth-layout>
    <h1 id="login-title">{{ mfaToken() ? 'Verificação em duas etapas' : 'Entrar' }}</h1>
    <p class="lead">{{ mfaToken() ? 'Digite o código do seu aplicativo autenticador.' : 'Acesse com o e-mail e a senha da sua conta.' }}</p>
    @if (!mfaToken()) {
      <form class="task-form" (ngSubmit)="submit()" autocomplete="on" aria-labelledby="login-title">
        <ui-field label="E-mail" for="login-email"><input id="login-email" type="email" name="email" autocomplete="username" required maxlength="254" [(ngModel)]="email" data-testid="login-email"></ui-field>
        <ui-field label="Senha" for="login-password"><input id="login-password" type="password" name="password" autocomplete="current-password" required maxlength="200" [(ngModel)]="password" data-testid="login-password"></ui-field>
        @if (error()) { <ui-alert tone="danger"><span data-testid="login-error">{{ error() }}</span></ui-alert> }
        <button type="submit" [disabled]="busy()" [class.is-loading]="busy()" data-testid="login-submit">Entrar</button>
      </form>
      <div class="auth-links"><a routerLink="/forgot-password" data-testid="forgot-link">Esqueci minha senha</a></div>
    } @else {
      <form class="task-form" (ngSubmit)="verify()">
        <ui-field label="Código de 6 dígitos" for="mfa-code" help="Abra o aplicativo autenticador no seu celular e informe o código exibido."><input id="mfa-code" class="otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" required minlength="6" maxlength="8" [(ngModel)]="code" data-testid="mfa-code"></ui-field>
        @if (error()) { <ui-alert tone="danger"><span data-testid="login-error">{{ error() }}</span></ui-alert> }
        <button type="submit" [disabled]="busy()" [class.is-loading]="busy()" data-testid="mfa-submit">Confirmar</button>
        <button type="button" class="secondary" (click)="cancelMfa()">Voltar</button>
      </form>
    }
  </ui-auth-layout>`,
})
export class LoginComponent {
  private readonly auth = inject(AuthService); private readonly router = inject(Router); private readonly route = inject(ActivatedRoute);
  email = ''; password = ''; code = ''; readonly busy = signal(false); readonly error = signal(''); readonly mfaToken = signal('');
  private done(user: SessionUser) {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    // Só caminhos internos: evita redirecionamento aberto. Pendências de segurança (senha/MFA) têm prioridade.
    const safe = !user.restricted && target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login');
    void this.router.navigateByUrl(safe ? target : landingPath(user));
  }
  private fail(e: HttpErrorResponse) {
    this.busy.set(false); this.password = ''; this.code = '';
    this.error.set(e.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' : e.status === 401 ? (this.mfaToken() ? 'Código inválido ou expirado.' : 'E-mail ou senha inválidos.') : 'Não foi possível entrar agora. Verifique sua conexão e tente novamente.');
  }
  submit() {
    this.busy.set(true); this.error.set('');
    this.auth.login(this.email, this.password).subscribe({ next: (outcome) => { this.busy.set(false); if (outcome.kind === 'mfa') this.mfaToken.set(outcome.mfaToken); else this.done(outcome.user); }, error: (e: HttpErrorResponse) => this.fail(e) });
  }
  verify() {
    this.busy.set(true); this.error.set('');
    this.auth.verifyMfa(this.mfaToken(), this.code).subscribe({ next: (user) => this.done(user), error: (e: HttpErrorResponse) => this.fail(e) });
  }
  cancelMfa() { this.mfaToken.set(''); this.code = ''; this.error.set(''); }
}
