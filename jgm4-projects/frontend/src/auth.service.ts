import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { ActorService } from './actor.service';
import { apiUrl } from './api-path';

export interface SessionUser {
  id: string | null; name: string; email: string | null; role: string; company: { id: string; name: string } | null; dev?: boolean; projects?: string[];
  mfaEnabled?: boolean; mustChangePassword?: boolean; restricted?: 'MFA_SETUP_REQUIRED' | 'PASSWORD_CHANGE_REQUIRED' | null;
}
export type LoginOutcome = { kind: 'session'; user: SessionUser } | { kind: 'mfa'; mfaToken: string };
export { roleLabels } from './ui/labels';

/** Tela inicial após o login: pendências de segurança primeiro; JGM4 com vários projetos → carteira; quem tem um único projeto vai direto ao painel dele. */
export function landingPath(user: SessionUser) {
  if (user.restricted) return '/account';
  const projects = user.projects ?? [];
  if (user.role === 'JGM4_ADMIN' || user.dev) return '/dashboard';
  if (projects.length === 1) return `/projects/${projects[0]}/dashboard`;
  return user.role === 'JGM4_CONSULTANT' ? '/dashboard' : '/';
}

const AUTH_URLS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/mfa/verify', '/api/auth/forgot', '/api/auth/reset', '/api/auth/logout', '/api/auth/me'];
const readCookie = (name: string) => { try { return document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('=') ?? ''; } catch { return ''; } };

// A sessão é um cookie HttpOnly de curta duração + refresh rotativo (também HttpOnly). Aqui só guardamos quem está logado, para a interface.
// Segurança real: o backend valida sessão, vínculo e perfil a cada requisição; isto é apenas experiência de uso.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient); private readonly router = inject(Router); private readonly actor = inject(ActorService);
  readonly user = signal<SessionUser | null>(null);
  /** API inalcançável (rede/5xx) ao verificar a sessão: não é o mesmo que "não autenticado". */
  readonly unreachable = signal(false);
  private loaded: Promise<void> | null = null;
  private refreshing$: Observable<boolean> | null = null;

  ensureLoaded() {
    return this.loaded ??= firstValueFrom(this.http.get<SessionUser>('/api/auth/me').pipe(
      tap((user) => { this.user.set(user); this.unreachable.set(false); }),
      catchError((error: HttpErrorResponse) => { this.user.set(null); if (error.status !== 401) { this.unreachable.set(true); this.loaded = null; } return of(null); }),
    )).then(() => undefined);
  }
  private loadMe() {
    return this.http.get<SessionUser>('/api/auth/me').pipe(tap((user) => { this.user.set(user); this.unreachable.set(false); this.loaded = Promise.resolve(); this.actor.refresh(); }));
  }
  login(email: string, password: string): Observable<LoginOutcome> {
    return this.http.post<{ mfaRequired?: boolean; mfaToken?: string }>('/api/auth/login', { email, password }).pipe(
      switchMap((response) => response.mfaRequired ? of<LoginOutcome>({ kind: 'mfa', mfaToken: response.mfaToken! }) : this.loadMe().pipe(map((user): LoginOutcome => ({ kind: 'session', user })))));
  }
  verifyMfa(mfaToken: string, code: string): Observable<SessionUser> {
    return this.http.post('/api/auth/mfa/verify', { mfaToken, code }).pipe(switchMap(() => this.loadMe()));
  }
  refreshUser() { return this.loadMe(); }
  logout() { this.http.post('/api/auth/logout', {}).pipe(catchError(() => of(null))).subscribe(() => this.expire()); }
  /** Descarta a sessão local e volta ao login. */
  expire() {
    this.user.set(null); this.loaded = Promise.resolve(); this.actor.clear();
    if (!this.router.url.startsWith('/login')) void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }
  /** Renova o access token com o refresh token (cookie HttpOnly). Uma única renovação por vez, compartilhada entre as requisições. */
  refresh(): Observable<boolean> {
    return this.refreshing$ ??= this.http.post('/api/auth/refresh', {}).pipe(map(() => true), catchError(() => of(false)), finalize(() => { this.refreshing$ = null; }), shareReplay(1));
  }
}

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService); const router = inject(Router);
  await auth.ensureLoaded();
  const user = auth.user();
  if (!user) return auth.unreachable() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  // Sessão com pendência obrigatória (trocar a senha / ativar MFA): só a página da conta.
  if (user.restricted && route.routeConfig?.path !== 'account') return router.createUrlTree(['/account']);
  return true;
};

/**
 * Todas as chamadas à API: cabeçalho X-Requested-With, token CSRF nos métodos que alteram estado e, em caso de 401, uma tentativa de renovar
 * a sessão (refresh rotativo) antes de mandar o usuário ao login.
 */
export const securityInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method); const csrf = unsafe ? readCookie('jgm4_csrf') : '';
  const usesApi = request.url === '/api' || request.url.startsWith('/api/');
  const prepared = usesApi ? request.clone({ url: apiUrl(request.url), setHeaders: { 'X-Requested-With': 'jgm4', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) } }) : request;
  return next(prepared).pipe(catchError((error: HttpErrorResponse) => {
    if (error.status !== 401 || AUTH_URLS.some((url) => request.url.startsWith(url))) return throwError(() => error);
    return auth.refresh().pipe(switchMap((renewed) => {
      if (!renewed) { auth.expire(); return throwError(() => error); }
      return next(prepared);
    }));
  }));
};

/** Área /admin: só JGM4_ADMIN (conveniência de interface; o backend aplica a regra de verdade). */
export const adminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService); const router = inject(Router); // inject() só funciona antes do primeiro await
  const result = (await authGuard(route, state)) as boolean | UrlTree;
  if (result !== true) return result;
  return auth.user()?.role === 'JGM4_ADMIN' || auth.user()?.dev ? true : router.createUrlTree(['/forbidden']);
};
