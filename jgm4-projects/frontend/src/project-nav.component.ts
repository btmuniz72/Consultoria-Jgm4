import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-project-nav', imports: [RouterLink, RouterLinkActive],
  template: `<nav class="project-nav" aria-label="Navegação do projeto">
    <a routerLink="/">Início</a>
    <a [routerLink]="['/projects', projectId(), 'plan']" routerLinkActive="active">Plano C</a>
    <a [routerLink]="['/projects', projectId(), 'gates']" routerLinkActive="active">Gates</a>
    <a [routerLink]="['/projects', projectId(), 'requests']" routerLinkActive="active">Solicitações</a>
    <a [routerLink]="['/projects', projectId(), 'alignment']" routerLinkActive="active">Reunião de alinhamento</a>
  </nav>`,
})
export class ProjectNavComponent { readonly projectId = input.required<string>(); }
