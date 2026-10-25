import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NavigationEnd, Router, provideRouter, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ACTOR_ROLES, ActorService, actorInterceptor } from './actor.service';
import { ApprovalsComponent } from './approvals.component';
import { ProjectPlanComponent } from './project-plan.component';
import { TaskDetailComponent } from './task-detail.component';
import { HomeComponent } from './home.component';
import { RequestsComponent } from './requests.component';
import { RequestDetailComponent } from './request-detail.component';
import { AlignmentComponent } from './alignment.component';
import { GatesComponent } from './gates.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/" aria-label="JGM4 Projects, início"><img class="brand-logo" src="assets/brand/logo-jgm4.png" alt="JGM4 Consultoria Logística" width="80" height="80"><span class="brand-divider" aria-hidden="true"></span><span class="brand-product">Projects</span></a>
      <div class="topbar-tools">
        <a class="approvals-link" routerLink="/approvals" aria-label="Central de Aprovações" data-testid="approvals-badge"><span aria-hidden="true">🔔</span> Aprovações @if (actor.summary(); as s) { @if (s.total > 0) { <span class="approvals-count" data-testid="approvals-count">{{ s.total }}</span> } }</a>
        <label class="role-switch"><span class="sr-only">Perfil simulado</span><select aria-label="Perfil simulado" [value]="actor.role()" (change)="actor.setRole($any($event.target).value)">@for (r of roles; track r.id) { <option [value]="r.id" [selected]="r.id === actor.role()">{{ r.label }}</option> }</select></label>
        <span class="environment"><span class="environment-dot"></span>Ambiente local <span class="stage-label">· Etapa 5</span></span>
      </div>
    </header>
    <router-outlet />
    <footer>JGM4 Consultoria <span>Estruturação · Controle · Sustentação</span></footer>
  `,
})
class AppComponent implements OnInit {
  readonly actor = inject(ActorService); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  readonly roles = ACTOR_ROLES;
  ngOnInit() {
    this.actor.refresh();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.actor.refresh());
    const timer = setInterval(() => this.actor.refresh(), 30000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([actorInterceptor])), provideRouter([
    { path: '', pathMatch: 'full', component: HomeComponent },
    { path: 'admin', component: HomeComponent },
    { path: 'approvals', component: ApprovalsComponent },
    { path: 'approvals/:id', component: ApprovalsComponent },
    { path: 'projects/:id/plan', component: ProjectPlanComponent },
    { path: 'projects/:id/gates', component: GatesComponent },
    { path: 'projects/:id/gates/:gateId', component: GatesComponent },
    { path: 'projects/:id/tasks/:taskId', component: TaskDetailComponent },
    { path: 'projects/:id/requests/:requestId', component: RequestDetailComponent },
    { path: 'projects/:id/requests', component: RequestsComponent },
    { path: 'projects/:id/alignment', component: AlignmentComponent },
    { path: 'projects', component: ProjectPlanComponent },
    { path: '**', redirectTo: 'projects' },
  ])],
}).catch(console.error);
