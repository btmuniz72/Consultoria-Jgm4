import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, RouterLink, RouterOutlet } from '@angular/router';
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
      <span class="environment"><span class="environment-dot"></span>Ambiente local <span class="stage-label">· Etapa 4</span></span>
    </header>
    <router-outlet />
    <footer>JGM4 Consultoria <span>Estruturação · Controle · Sustentação</span></footer>
  `,
})
class AppComponent {}

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideRouter([
    { path: '', pathMatch: 'full', component: HomeComponent },
    { path: 'admin', component: HomeComponent },
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
