import { Component, DestroyRef, OnInit, inject, isDevMode, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NavigationEnd, Router, Routes, provideRouter, RouterLink, RouterLinkActive, RouterOutlet, withInMemoryScrolling } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ActorService } from './actor.service';
import { AuthService, adminGuard, authGuard, securityInterceptor } from './auth.service';
import { LoginComponent } from './login.component';
import { PrivacyRedirectComponent } from './legal.component';
import { DialogHostComponent } from './ui/dialog.service';
import { ForbiddenComponent, NotFoundComponent } from './ui/status-pages';
import { NavItem, navigationFor, roleLabel } from './ui/labels';
import { initials } from './ui/format';

const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password'];
/** Contexto da página no topo (e título da aba), por prefixo da rota. */
const CONTEXTS: [RegExp, string][] = [
  [/^\/dashboard/, 'Dashboard'], [/^\/projects\/[^/]+\/dashboard/, 'Painel do projeto'], [/^\/projects\/[^/]+\/plan/, 'Plano do projeto'], [/^\/projects\/[^/]+\/tasks/, 'Atividade'], [/^\/projects\/[^/]+\/requests/, 'Solicitações'],
  [/^\/projects\/[^/]+\/gates/, 'Gates'], [/^\/projects\/[^/]+\/reports/, 'Relatórios'], [/^\/projects\/[^/]+\/audit/, 'Auditoria'], [/^\/projects\/[^/]+\/manage/, 'Gestão do projeto'], [/^\/projects\/[^/]+\/alignment/, 'Reunião de alinhamento'],
  [/^\/projects\/[^/]+\/proposal/, 'Proposta técnica e comercial'], [/^\/projects/, 'Projetos'], [/^\/approvals/, 'Central de Aprovações'], [/^\/account/, 'Minha conta'], [/^\/admin\/companies/, 'Administração · Empresas'], [/^\/admin\/users/, 'Administração · Usuários'],
  [/^\/admin\/projects/, 'Administração · Projetos'], [/^\/admin\/templates/, 'Administração · Templates'], [/^\/admin\/security/, 'Administração · Segurança'], [/^\/privacy/, 'Política de Privacidade'], [/^\/terms/, 'Termos de Uso'],
  [/^\/dev\/design-system/, 'Design System'], [/^\/forbidden/, 'Acesso não permitido'], [/^\/$/, 'Início'],
];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DialogHostComponent],
  template: `
    <a class="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <div class="app-shell" [class.nav-open]="navOpen()" [class.no-sidebar]="!auth.user() || authPage()">
      @if (auth.user() && !authPage()) {
        <aside class="sidebar" id="menu" aria-label="Menu principal">
          <a class="brand" routerLink="/" aria-label="JGM4 Projects, início"><img class="brand-logo" src="assets/brand/logo-jgm4.png" alt="JGM4 Consultoria Logística" width="52" height="52"><span class="brand-product">JGM4 Projects<small>Consultoria Logística</small></span></a>
          <button type="button" class="nav-close" (click)="navOpen.set(false)" aria-label="Fechar o menu" data-testid="nav-close">✕</button>
          <nav aria-label="Navegação">
            @for (group of groups(); track group.id) {
              <div class="side-group"><h2>{{ group.label }}</h2>
                @for (item of group.items; track item.id) {
                  <a class="side-link" [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.link === '/projects' }" (click)="navOpen.set(false)" [attr.data-testid]="testId(item)">
                    <span>{{ item.label }}</span>@if (item.id === 'approvals' && (actor.summary()?.total ?? 0) > 0) { <span class="side-count" data-testid="approvals-count">{{ actor.summary()?.total }}</span> }</a>
                }</div>
            }
          </nav>
          <div class="sidebar-footer"><a class="side-link" routerLink="/account" routerLinkActive="active" (click)="navOpen.set(false)" data-testid="nav-account">Minha conta</a></div>
        </aside>
        <div class="shell-backdrop" (click)="navOpen.set(false)" aria-hidden="true"></div>
      }
      <div class="shell-main">
        @if (!authPage()) {
          <header class="topbar">
            <div class="topbar-left">
              @if (auth.user()) { <button type="button" class="nav-toggle" (click)="navOpen.set(!navOpen())" [attr.aria-expanded]="navOpen()" aria-controls="menu" aria-label="Abrir ou fechar o menu" data-testid="nav-toggle">☰</button> }
              @else { <a class="brand" routerLink="/" aria-label="JGM4 Projects, início"><img class="brand-logo" src="assets/brand/logo-jgm4.png" alt="JGM4 Consultoria Logística" width="40" height="40"><span class="brand-product">JGM4 Projects</span></a> }
              <span class="page-context" data-testid="page-context">{{ context() }}</span>
            </div>
            @if (auth.user(); as user) {
              <div class="topbar-tools">
                <div class="user-chip" data-testid="current-user"><span class="avatar" aria-hidden="true">{{ initials(user.name) }}</span><span class="who"><strong>{{ user.name }}</strong><span>{{ roleName(user.role) }}{{ user.company ? ' · ' + user.company.name : '' }}</span></span></div>
                <button type="button" class="logout-button" data-testid="logout" (click)="auth.logout()">Sair</button>
              </div>
            } @else { <a class="btn secondary" routerLink="/login">Entrar</a> }
          </header>
        }
        @if (auth.unreachable()) { <div class="alert alert-warning service-banner" role="status" data-testid="service-unavailable"><strong>Serviço temporariamente indisponível</strong>Não conseguimos falar com o servidor. Sua sessão foi mantida; verifique sua conexão e <a href="" (click)="reload($event)">tente novamente</a>.</div> }
        <div id="conteudo" tabindex="-1"><router-outlet /></div>
        <footer><span>JGM4 Consultoria · Estruturação · Controle · Sustentação</span><span><a href="/pages/politica.html" data-testid="footer-privacy">Política de Privacidade</a> · <a routerLink="/terms" data-testid="footer-terms">Termos de uso</a></span></footer>
      </div>
    </div>
    <ui-dialog-host />
  `,
})
class AppComponent implements OnInit {
  readonly actor = inject(ActorService); readonly auth = inject(AuthService); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef); private readonly title = inject(Title);
  readonly navOpen = signal(false); readonly url = signal('/'); initials = initials;
  authPage() { return AUTH_PAGES.some((page) => this.url().startsWith(page)); }
  roleName(role: string) { return roleLabel(role); }
  projectId() { return /^\/projects\/([0-9a-f-]{36})/i.exec(this.url())?.[1] ?? null; }
  context() { const url = this.url(); return CONTEXTS.find(([pattern]) => pattern.test(url))?.[1] ?? 'JGM4 Projects'; }
  groups(): { id: string; label: string; items: NavItem[] }[] {
    const user = this.auth.user(); const items = navigationFor(user?.role, { dev: user?.dev, projectId: this.projectId() });
    return [{ id: 'principal', label: 'Principal' }, { id: 'gestao', label: 'Gestão' }, { id: 'administracao', label: 'Administração' }].map((g) => ({ ...g, items: items.filter((item) => item.group === g.id) })).filter((g) => g.items.length);
  }
  testId(item: NavItem) { return item.id === 'dashboard' ? 'nav-dashboard' : item.id === 'approvals' ? 'approvals-badge' : item.id.startsWith('admin-') ? `nav-${item.id}` : `side-${item.id}`; }
  reload(event: Event) { event.preventDefault(); window.location.reload(); }
  ngOnInit() {
    this.url.set(this.router.url);
    void this.auth.ensureLoaded().then(() => { if (this.auth.user()) this.actor.refresh(); });
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.url.set(this.router.url); this.navOpen.set(false); this.title.setTitle(`${this.context()} — JGM4 Projects`);
      if (this.auth.user()) this.actor.refresh();
    });
    const timer = setInterval(() => { if (this.auth.user()) this.actor.refresh(); }, 30000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', loadComponent: () => import('./password-pages.component').then((m) => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./password-pages.component').then((m) => m.ResetPasswordComponent) },
  { path: 'privacy', component: PrivacyRedirectComponent },
  { path: 'terms', loadComponent: () => import('./legal.component').then((m) => m.LegalComponent), data: { kind: 'terms' } },
  { path: 'forbidden', component: ForbiddenComponent },
  { path: 'admin/security', loadComponent: () => import('./admin-security.component').then((m) => m.AdminSecurityComponent), canActivate: [adminGuard] },
  { path: 'admin/companies', loadComponent: () => import('./admin-ops.components').then((m) => m.AdminCompaniesComponent), canActivate: [adminGuard] },
  { path: 'admin/users', loadComponent: () => import('./admin-ops.components').then((m) => m.AdminUsersComponent), canActivate: [adminGuard] },
  { path: 'admin/projects', loadComponent: () => import('./admin-ops.components').then((m) => m.AdminProjectsComponent), canActivate: [adminGuard] },
  { path: 'admin/templates', loadComponent: () => import('./admin-templates.components').then((m) => m.AdminTemplatesComponent), canActivate: [adminGuard] },
  { path: 'admin/templates/:id', loadComponent: () => import('./admin-templates.components').then((m) => m.AdminTemplateEditorComponent), canActivate: [adminGuard] },
  { path: 'admin/projects/:id/members', loadComponent: () => import('./admin-ops.components').then((m) => m.AdminProjectMembersComponent), canActivate: [adminGuard] },
  { path: 'account', loadComponent: () => import('./account.component').then((m) => m.AccountComponent), canActivate: [authGuard] },
  { path: 'dashboard', loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent), canActivate: [authGuard] },
  { path: 'projects/:id/dashboard', loadComponent: () => import('./project-dashboard.component').then((m) => m.ProjectDashboardComponent), canActivate: [authGuard] },
  { path: 'projects/:id/reports', loadComponent: () => import('./reports.component').then((m) => m.ReportsComponent), canActivate: [authGuard] },
  { path: 'projects/:id/documents', loadComponent: () => import('./project-documents.component').then((m) => m.ProjectDocumentsComponent), canActivate: [authGuard] },
  { path: 'projects/:id/reports/view/:kind', loadComponent: () => import('./report-view.component').then((m) => m.ReportViewComponent), canActivate: [authGuard] },
  { path: 'projects/:id/audit', loadComponent: () => import('./audit.component').then((m) => m.AuditComponent), canActivate: [authGuard] },
  { path: 'projects/:id/manage', loadComponent: () => import('./project-manage.component').then((m) => m.ProjectManageComponent), canActivate: [authGuard] },
  { path: '', pathMatch: 'full', loadComponent: () => import('./home.component').then((m) => m.HomeComponent), canActivate: [authGuard] },
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/companies' },
  { path: 'approvals', loadComponent: () => import('./approvals.component').then((m) => m.ApprovalsComponent), canActivate: [authGuard] },
  { path: 'approvals/:id', loadComponent: () => import('./approvals.component').then((m) => m.ApprovalsComponent), canActivate: [authGuard] },
  { path: 'projects/:id/proposal', loadComponent: () => import('./proposal.component').then((m) => m.ProposalComponent), canActivate: [authGuard] },
  { path: 'projects/:id/plan', loadComponent: () => import('./project-plan.component').then((m) => m.ProjectPlanComponent), canActivate: [authGuard] },
  { path: 'projects/:id/gates', loadComponent: () => import('./gates.component').then((m) => m.GatesComponent), canActivate: [authGuard] },
  { path: 'projects/:id/gates/:gateId', loadComponent: () => import('./gates.component').then((m) => m.GatesComponent), canActivate: [authGuard] },
  { path: 'projects/:id/tasks/:taskId', loadComponent: () => import('./task-detail.component').then((m) => m.TaskDetailComponent), canActivate: [authGuard] },
  { path: 'projects/:id/requests/:requestId', loadComponent: () => import('./request-detail.component').then((m) => m.RequestDetailComponent), canActivate: [authGuard] },
  { path: 'projects/:id/requests', loadComponent: () => import('./requests.component').then((m) => m.RequestsComponent), canActivate: [authGuard] },
  { path: 'projects/:id/alignment', loadComponent: () => import('./alignment.component').then((m) => m.AlignmentComponent), canActivate: [authGuard] },
  { path: 'projects', loadComponent: () => import('./project-plan.component').then((m) => m.ProjectPlanComponent), canActivate: [authGuard] },
  // Página de referência do Design System: somente fora de produção (isDevMode() é falso no build de produção).
  ...(isDevMode() ? [{ path: 'dev/design-system', loadComponent: () => import('./ui/design-system.component').then((m) => m.DesignSystemComponent) }] : []),
  { path: '**', component: NotFoundComponent },
];

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([securityInterceptor])), provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }))],
}).catch(console.error);
