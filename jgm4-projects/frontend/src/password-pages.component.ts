import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthLayoutComponent } from './ui/status-pages';
import { AlertComponent, FormFieldComponent } from './ui/ui.components';
import { friendlyError } from './ui/labels';

export const passwordPolicyText = 'Mínimo de 10 caracteres, com letra maiúscula, letra minúscula, número e caractere especial. Evite senhas comuns e o seu nome ou e-mail.';
export const apiMessages = (e: HttpErrorResponse, fallback: string) => { const m = e.error?.message; const server = Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : undefined; return friendlyError(e.status, server, fallback.replace(/^Não foi possível /, '').replace(/.$/, '')); };

@Component({
  selector: 'app-forgot-password', imports: [FormsModule, RouterLink, AuthLayoutComponent, FormFieldComponent, AlertComponent],
  template: `<ui-auth-layout><h1>Esqueci minha senha</h1>
    <p class="lead">Informe o e-mail da conta. Se ele estiver cadastrado, enviaremos um link de uso único, com validade curta.</p>
    @if (sent()) { <ui-alert tone="success" title="Verifique seu e-mail"><span data-testid="forgot-done">Se o e-mail estiver cadastrado, enviamos as instruções. Verifique sua caixa de entrada.</span></ui-alert> }
    @else { <form class="task-form" (ngSubmit)="submit()"><ui-field label="E-mail" for="forgot-email"><input id="forgot-email" type="email" name="email" required maxlength="254" autocomplete="username" [(ngModel)]="email" data-testid="forgot-email"></ui-field>
      @if (error()) { <ui-alert tone="danger">{{ error() }}</ui-alert> }<button type="submit" [disabled]="busy()" data-testid="forgot-submit">Enviar instruções</button></form> }
    <div class="auth-links"><a routerLink="/login">Voltar ao login</a></div></ui-auth-layout>`,
})
export class ForgotPasswordComponent {
  private readonly http = inject(HttpClient); email = ''; readonly sent = signal(false); readonly busy = signal(false); readonly error = signal('');
  submit() { this.busy.set(true); this.http.post('/api/auth/forgot', { email: this.email }).subscribe({ next: () => { this.busy.set(false); this.sent.set(true); }, error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.status === 429 ? 'Muitas solicitações. Aguarde e tente novamente.' : apiMessages(e, 'Não foi possível enviar agora.')); } }); }
}

@Component({
  selector: 'app-reset-password', imports: [FormsModule, RouterLink, AuthLayoutComponent, FormFieldComponent, AlertComponent],
  template: `<ui-auth-layout><h1>Definir nova senha</h1>
    @if (!token) { <ui-alert tone="danger" title="Link inválido">O link de redefinição não é válido ou já expirou. Solicite um novo.</ui-alert><a class="btn" routerLink="/forgot-password">Solicitar novo link</a> }
    @else if (done()) { <ui-alert tone="success" title="Senha definida"><span data-testid="reset-done">Pronto! Entre com a nova senha.</span></ui-alert><a class="btn" routerLink="/login">Ir para o login</a> }
    @else { <p class="lead">{{ policy }}</p><form class="task-form" (ngSubmit)="submit()">
      <ui-field label="Nova senha" for="reset-password"><input id="reset-password" type="password" name="password" required minlength="10" maxlength="128" autocomplete="new-password" [(ngModel)]="password" data-testid="reset-password"></ui-field>
      <ui-field label="Repita a senha" for="reset-confirm"><input id="reset-confirm" type="password" name="confirm" required autocomplete="new-password" [(ngModel)]="confirm" data-testid="reset-confirm"></ui-field>
      @if (error()) { <ui-alert tone="danger"><span data-testid="reset-error">{{ error() }}</span></ui-alert> }<button type="submit" [disabled]="busy()" data-testid="reset-submit">Salvar nova senha</button></form> }
  </ui-auth-layout>`,
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
