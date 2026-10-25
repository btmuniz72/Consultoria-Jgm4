import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, SessionUser, landingPath } from './auth.service';

@Component({
  selector: 'app-login', imports: [FormsModule, RouterLink],
  template: `<main class="login-page">
    <section class="panel login-panel" aria-labelledby="login-title">
      <p class="eyebrow">JGM4 PROJECTS</p><h1 id="login-title">{{ mfaToken() ? 'Verificação em duas etapas' : 'Entrar' }}</h1>
      <p class="lead">{{ mfaToken() ? 'Informe o código de 6 dígitos do seu aplicativo autenticador.' : 'Acesse com o e-mail e a senha da sua conta.' }}</p>
      @if (!mfaToken()) {
        <form class="task-form" (ngSubmit)="submit()" autocomplete="on">
          <label>E-mail<input type="email" name="email" autocomplete="username" required maxlength="254" [(ngModel)]="email" data-testid="login-email"></label>
          <label>Senha<input type="password" name="password" autocomplete="current-password" required maxlength="200" [(ngModel)]="password" data-testid="login-password"></label>
          @if (error()) { <p class="error-note" role="alert" data-testid="login-error">{{ error() }}</p> }
          <button type="submit" [disabled]="busy()" data-testid="login-submit">{{ busy() ? 'Entrando…' : 'Entrar' }}</button>
          <a class="small-link" routerLink="/forgot-password" data-testid="forgot-link">Esqueci minha senha</a>
        </form>
      } @else {
        <form class="task-form" (ngSubmit)="verify()">
          <label>Código<input name="code" inputmode="numeric" autocomplete="one-time-code" required minlength="6" maxlength="8" [(ngModel)]="code" data-testid="mfa-code"></label>
          @if (error()) { <p class="error-note" role="alert" data-testid="login-error">{{ error() }}</p> }
          <button type="submit" [disabled]="busy()" data-testid="mfa-submit">Confirmar</button>
          <button type="button" class="secondary" (click)="cancelMfa()">Voltar</button>
        </form>
      }
    </section>
  </main>`,
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
    this.error.set(e.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' : e.status === 401 ? (this.mfaToken() ? 'Código inválido ou expirado.' : 'E-mail ou senha inválidos.') : 'Não foi possível entrar. Verifique a conexão com a API.');
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
