import { Component, inject, input } from '@angular/core';
import { AuthService } from './auth.service';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-project-nav', imports: [RouterLink, RouterLinkActive],
  template: `<nav class="project-nav" aria-label="Navegação do projeto">
    <a routerLink="/">Início</a>
    <a [routerLink]="['/projects', projectId(), 'dashboard']" routerLinkActive="active">Dashboard</a>
    <a [routerLink]="['/projects', projectId(), 'plan']" routerLinkActive="active">Plano C</a>
    <a [routerLink]="['/projects', projectId(), 'gates']" routerLinkActive="active">Gates</a>
    <a [routerLink]="['/projects', projectId(), 'requests']" routerLinkActive="active">Solicitações</a>
    <a [routerLink]="['/projects', projectId(), 'alignment']" routerLinkActive="active">Reunião de alinhamento</a>
    @if (auth.user()?.role !== 'CLIENT_USER') { <a [routerLink]="['/projects', projectId(), 'reports']" routerLinkActive="active" data-testid="nav-reports">Relatórios</a> }
    @if (canAudit()) { <a [routerLink]="['/projects', projectId(), 'audit']" routerLinkActive="active" data-testid="nav-audit">Auditoria</a> }
    @if (isJgm4()) { <a [routerLink]="['/projects', projectId(), 'manage']" routerLinkActive="active" data-testid="nav-manage">Gestão</a> }
  </nav>`,
})
export class ProjectNavComponent {
  readonly projectId = input.required<string>(); readonly auth = inject(AuthService);
  isJgm4() { const user = this.auth.user(); return !!user && (!!user.dev || user.role.startsWith('JGM4')); }
  canAudit() { const user = this.auth.user(); return this.isJgm4() || user?.role === 'CLIENT_SPONSOR'; }
}
