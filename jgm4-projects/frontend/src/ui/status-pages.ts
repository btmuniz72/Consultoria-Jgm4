import { Component, Input } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { inject } from '@angular/core';

/** Layout das telas de autenticação (login, esqueci a senha, redefinir): marca JGM4 à esquerda e cartão central. */
@Component({
  selector: 'ui-auth-layout', imports: [RouterLink],
  template: `<div class="auth-layout">
    <aside class="auth-brand"><div><img class="brand-logo" src="assets/brand/logo-jgm4.png" alt="JGM4 Consultoria Logística" width="72" height="72"><h1>JGM4 Projects</h1><p>Acompanhe fases, Gates, solicitações e decisões do seu projeto de implantação em um só lugar.</p></div><small>JGM4 Consultoria · Estruturação · Controle · Sustentação</small></aside>
    <main class="auth-main" id="conteudo"><div class="auth-card"><ng-content /><p class="auth-footer"><a routerLink="/privacy">Privacidade</a> · <a routerLink="/terms">Termos de uso</a></p></div></main></div>`,
})
export class AuthLayoutComponent {}

@Component({
  selector: 'ui-error-page', imports: [RouterLink],
  template: `<main class="error-page"><div><p class="code" aria-hidden="true">{{ code }}</p><h1>{{ title }}</h1><p>{{ message }}</p><div class="action-buttons"><button type="button" class="secondary" (click)="back()">Voltar</button><a class="btn" routerLink="/">Ir para o início</a></div></div></main>`,
})
export class ErrorPageComponent {
  @Input() code = ''; @Input() title = ''; @Input() message = ''; private readonly location = inject(Location); private readonly router = inject(Router);
  back() { if (window.history.length > 1) this.location.back(); else void this.router.navigateByUrl('/'); }
}

@Component({ selector: 'app-forbidden', imports: [ErrorPageComponent], template: `<ui-error-page code="403" title="Acesso não permitido" message="Você não possui permissão para acessar esta área. Se acredita que deveria ter acesso, fale com o administrador do sistema." />` })
export class ForbiddenComponent {}
@Component({ selector: 'app-not-found', imports: [ErrorPageComponent], template: `<ui-error-page code="404" title="Página não encontrada" message="O endereço que você tentou abrir não existe ou foi movido. Verifique o link ou volte ao início." />` })
export class NotFoundComponent {}
