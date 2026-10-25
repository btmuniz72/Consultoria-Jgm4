import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

export const passwordPolicyText = 'Mínimo de 10 caracteres, com letra maiúscula, letra minúscula, número e caractere especial. Evite senhas comuns e o seu nome ou e-mail.';
export const apiMessages = (e: HttpErrorResponse, fallback: string) => { const m = e.error?.message; return Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : fallback; };

@Component({
  selector: 'app-forgot-password', imports: [FormsModule, RouterLink],
  template: `<main class="login-page"><section class="panel login-panel"><p class="eyebrow">JGM4 PROJECTS</p><h1>Esqueci minha senha</h1>
    <p class="lead">Informe o e-mail da conta. Se ele estiver cadastrado, enviaremos um link de uso único, válido por tempo limitado.</p>
    @if (sent()) { <p class="success-note" role="status" data-testid="forgot-done">Se o e-mail estiver cadastrado, enviamos as instruções. Verifique sua caixa de entrada.</p> }
    @else { <form class="task-form" (ngSubmit)="submit()"><label>E-mail<input type="email" name="email" required maxlength="254" autocomplete="username" [(ngModel)]="email" data-testid="forgot-email"></label>
      @if (error()) { <p class="error-note" role="alert">{{ error() }}</p> }<button type="submit" [disabled]="busy()" data-testid="forgot-submit">Enviar instruções</button></form> }
    <a class="small-link" routerLink="/login">Voltar ao login</a></section></main>`,
})
export class ForgotPasswordComponent {
  private readonly http = inject(HttpClient); email = ''; readonly sent = signal(false); readonly busy = signal(false); readonly error = signal('');
  submit() { this.busy.set(true); this.http.post('/api/auth/forgot', { email: this.email }).subscribe({ next: () => { this.busy.set(false); this.sent.set(true); }, error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.status === 429 ? 'Muitas solicitações. Aguarde e tente novamente.' : apiMessages(e, 'Não foi possível enviar agora.')); } }); }
}

@Component({
  selector: 'app-reset-password', imports: [FormsModule, RouterLink],
  template: `<main class="login-page"><section class="panel login-panel"><p class="eyebrow">JGM4 PROJECTS</p><h1>Definir nova senha</h1>
    @if (!token) { <p class="error-note" role="alert">Link inválido. Solicite uma nova redefinição.</p><a class="small-link" routerLink="/forgot-password">Solicitar novo link</a> }
    @else if (done()) { <p class="success-note" role="status" data-testid="reset-done">Senha definida. Entre com a nova senha.</p><a class="btn" routerLink="/login">Ir para o login</a> }
    @else { <p class="lead">{{ policy }}</p><form class="task-form" (ngSubmit)="submit()">
      <label>Nova senha<input type="password" name="password" required minlength="10" maxlength="128" autocomplete="new-password" [(ngModel)]="password" data-testid="reset-password"></label>
      <label>Repita a senha<input type="password" name="confirm" required autocomplete="new-password" [(ngModel)]="confirm" data-testid="reset-confirm"></label>
      @if (error()) { <p class="error-note" role="alert" data-testid="reset-error">{{ error() }}</p> }<button type="submit" [disabled]="busy()" data-testid="reset-submit">Salvar nova senha</button></form> }
  </section></main>`,
})
export class ResetPasswordComponent {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  readonly policy = passwordPolicyText; token = this.route.snapshot.queryParamMap.get('token') ?? ''; password = ''; confirm = ''; readonly done = signal(false); readonly busy = signal(false); readonly error = signal('');
  constructor() { if (this.token) void this.router.navigate([], { queryParams: {}, replaceUrl: true }); } // tira o token da barra de endereço/histórico
  submit() {
    if (this.password !== this.confirm) { this.error.set('As senhas não coincidem.'); return; }
    this.busy.set(true); this.error.set('');
    this.http.post('/api/auth/reset', { token: this.token, password: this.password }).subscribe({ next: () => { this.busy.set(false); this.done.set(true); }, error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(apiMessages(e, 'Não foi possível redefinir a senha.')); } });
  }
}
