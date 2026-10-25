import { NgTemplateOutlet } from '@angular/common';
import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { StatusDomain, Tone, roleLabel, statusLabel, toneOf } from './labels';
import { fmtDate, fmtDateTime, fmtHours, fmtPercent, initials } from './format';

// Componentes do Design System JGM4 (Etapa 10.5). Estilos em styles/components.css; catálogo em docs/design-system.md e /dev/design-system.

// ---- Pipes de formatação (pt-BR) ----
@Pipe({ name: 'fmtDate' }) export class FmtDatePipe implements PipeTransform { transform(value: string | Date | null | undefined, empty = '—') { return fmtDate(value, empty); } }
@Pipe({ name: 'fmtDateTime' }) export class FmtDateTimePipe implements PipeTransform { transform(value: string | Date | null | undefined, empty = '—') { return fmtDateTime(value, empty); } }
@Pipe({ name: 'fmtHours' }) export class FmtHoursPipe implements PipeTransform { transform(value: number | string | null | undefined) { return fmtHours(value); } }
@Pipe({ name: 'fmtPercent' }) export class FmtPercentPipe implements PipeTransform { transform(value: number | string | null | undefined) { return fmtPercent(value); } }
@Pipe({ name: 'roleLabel' }) export class RoleLabelPipe implements PipeTransform { transform(value: string | null | undefined) { return roleLabel(value); } }
@Pipe({ name: 'statusLabel' }) export class StatusLabelPipe implements PipeTransform { transform(value: string | null | undefined, domain: StatusDomain) { return statusLabel(domain, value); } }

// ---- Status ----
@Component({ selector: 'ui-badge', template: `<span class="badge" [class]="'badge badge-' + resolved()" [attr.data-status]="status">{{ text() }}</span>` })
export class StatusBadgeComponent {
  @Input() status: string | null | undefined; @Input() domain: StatusDomain | null = null; @Input() label: string | null = null; @Input() tone: Tone | null = null;
  text() { return this.label ?? (this.domain ? statusLabel(this.domain, this.status) : this.status ?? '—'); }
  resolved() { return this.tone ?? toneOf(this.status); }
}

@Component({ selector: 'ui-progress', template: `<div class="progress-line"><div class="bar" [class.big]="big" role="progressbar" [attr.aria-valuenow]="clamped()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="ariaLabel"><span [style.width.%]="clamped()" [class.over]="over"></span></div>@if (caption) { <span>{{ caption }}</span> }</div>` })
export class ProgressComponent { @Input() value = 0; @Input() caption = ''; @Input() big = false; @Input() over = false; @Input() ariaLabel = 'Progresso'; clamped() { return Math.max(0, Math.min(100, Number(this.value) || 0)); } }

// ---- Layout de página ----
interface Crumb { label: string; link?: unknown[] | string }
@Component({ selector: 'ui-breadcrumb', imports: [RouterLink], template: `<nav aria-label="Você está em"><ol class="breadcrumb">@for (item of items; track item.label; let last = $last) { <li>@if (item.link && !last) { <a [routerLink]="item.link">{{ item.label }}</a> } @else { <span [attr.aria-current]="last ? 'page' : null">{{ item.label }}</span> }</li> }</ol></nav>` })
export class BreadcrumbComponent { @Input() items: Crumb[] = []; }

@Component({
  selector: 'ui-page-header', imports: [BreadcrumbComponent],
  template: `@if (breadcrumb.length) { <ui-breadcrumb [items]="breadcrumb" /> }<div class="page-heading"><div>@if (eyebrow) { <p class="eyebrow">{{ eyebrow }}</p> }<h1>{{ title }}</h1>@if (subtitle) { <p class="lead">{{ subtitle }}</p> }<ng-content select="[meta]" /></div><div class="page-actions"><ng-content /></div></div>`,
})
export class PageHeaderComponent { @Input() title = ''; @Input() eyebrow = ''; @Input() subtitle = ''; @Input() breadcrumb: Crumb[] = []; }

@Component({ selector: 'ui-section-header', template: `<div class="section-heading"><div>@if (eyebrow) { <p class="eyebrow">{{ eyebrow }}</p> }<h2>{{ title }}</h2></div><ng-content /></div>` })
export class SectionHeaderComponent { @Input() title = ''; @Input() eyebrow = ''; }

@Component({ selector: 'ui-card', template: `<section class="card">@if (title) { <div class="card-title"><div>@if (eyebrow) { <p class="eyebrow">{{ eyebrow }}</p> }<h2>{{ title }}</h2></div><ng-content select="[actions]" /></div> }<ng-content /></section>` })
export class CardComponent { @Input() title = ''; @Input() eyebrow = ''; }

@Component({
  selector: 'ui-stat-card', imports: [RouterLink, NgTemplateOutlet],
  template: `@if (link) { <a class="stat-card" [class.warn]="tone === 'warning'" [class.danger]="tone === 'danger'" [routerLink]="link" [fragment]="fragment || undefined"><ng-container *ngTemplateOutlet="body" /></a> } @else { <div class="stat-card" [class.warn]="tone === 'warning'" [class.danger]="tone === 'danger'"><ng-container *ngTemplateOutlet="body" /></div> }
    <ng-template #body><span class="stat-label">{{ label }}</span><strong class="stat-value">{{ value }}</strong>@if (hint) { <span class="stat-hint">{{ hint }}</span> }</ng-template>`,
})
export class StatCardComponent { @Input() label = ''; @Input() value: string | number = ''; @Input() hint = ''; @Input() tone: Tone = 'neutral'; @Input() link: unknown[] | string | null = null; @Input() fragment = ''; }

// ---- Estados ----
@Component({ selector: 'ui-empty', template: `<div class="empty-state"><div class="state-icon" aria-hidden="true">{{ icon }}</div><h2>{{ title }}</h2>@if (message) { <p>{{ message }}</p> }<div class="action-buttons"><ng-content /></div></div>` })
export class EmptyStateComponent { @Input() icon = '○'; @Input() title = 'Nada por aqui'; @Input() message = ''; }

@Component({ selector: 'ui-loading', template: `<section class="state-panel" aria-live="polite" role="status"><span class="loader" aria-hidden="true"></span><h2>{{ message }}</h2></section>` })
export class LoadingStateComponent { @Input() message = 'Carregando…'; }

@Component({ selector: 'ui-skeleton', template: `<div aria-hidden="true" role="presentation"><span class="skeleton skeleton-title"></span>@for (n of rows; track n) { <span class="skeleton skeleton-line" [style.width.%]="100 - n * 7"></span> }</div>` })
export class SkeletonComponent { @Input() lines = 4; get rows() { return Array.from({ length: this.lines }, (_, i) => i); } }

@Component({ selector: 'ui-alert', template: `<div class="alert" [class]="'alert alert-' + tone" [attr.role]="tone === 'danger' ? 'alert' : 'status'">@if (title) { <strong>{{ title }}</strong> }<ng-content /></div>` })
export class AlertComponent { @Input() tone: 'info' | 'success' | 'warning' | 'danger' = 'info'; @Input() title = ''; }

// ---- Formulário / navegação ----
@Component({ selector: 'ui-field', template: `<div class="field"><label [attr.for]="for">{{ label }}@if (required) { <span aria-hidden="true"> *</span> }</label><ng-content />@if (help && !error) { <span class="field-help">{{ help }}</span> }@if (error) { <span class="field-error" role="alert">{{ error }}</span> }</div>` })
export class FormFieldComponent { @Input() label = ''; @Input() for = ''; @Input() help = ''; @Input() error = ''; @Input() required = false; }

@Component({ selector: 'ui-tabs', imports: [RouterLink, RouterLinkActive], template: `<nav class="tabs" [attr.aria-label]="label">@for (tab of tabs; track tab.label) { <a [routerLink]="tab.link" routerLinkActive="active">{{ tab.label }}</a> }</nav>` })
export class TabsComponent { @Input() tabs: { label: string; link: unknown[] | string }[] = []; @Input() label = 'Seções'; }

@Component({ selector: 'ui-user-badge', template: `<span class="user-badge"><span class="avatar" aria-hidden="true">{{ initials(name) }}</span><span><strong>{{ name }}</strong>@if (subtitle) { <small>{{ subtitle }}</small> }</span></span>` })
export class UserBadgeComponent { @Input() name = ''; @Input() subtitle = ''; initials = initials; }

@Component({ selector: 'ui-pagination', template: `@if (pages > 1) { <nav class="pagination" aria-label="Paginação"><button type="button" class="secondary" [disabled]="page <= 1" (click)="go(page - 1)">Anterior</button><span>Página {{ page }} de {{ pages }}</span><button type="button" class="secondary" [disabled]="page >= pages" (click)="go(page + 1)">Próxima</button></nav> }` })
export class PaginationComponent { @Input() page = 1; @Input() pages = 1; @Output() pageChange = new EventEmitter<number>(); go(next: number) { this.pageChange.emit(Math.max(1, Math.min(this.pages, next))); } }

@Component({
  selector: 'ui-drawer',
  template: `@if (open) { <div class="dialog-backdrop" (click)="closed.emit()" style="place-items: stretch end; padding: 0;"><aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="title" (click)="$event.stopPropagation()" (keydown.escape)="closed.emit()"><div class="card-title"><h2>{{ title }}</h2><button type="button" class="tertiary" (click)="closed.emit()" aria-label="Fechar">✕</button></div><ng-content /></aside></div> }`,
})
export class DrawerComponent { @Input() open = false; @Input() title = ''; @Output() closed = new EventEmitter<void>(); }

export const UI = [FmtDatePipe, FmtDateTimePipe, FmtHoursPipe, FmtPercentPipe, RoleLabelPipe, StatusLabelPipe, StatusBadgeComponent, ProgressComponent, BreadcrumbComponent, PageHeaderComponent, SectionHeaderComponent, CardComponent, StatCardComponent,
  EmptyStateComponent, LoadingStateComponent, SkeletonComponent, AlertComponent, FormFieldComponent, TabsComponent, UserBadgeComponent, PaginationComponent, DrawerComponent] as const;
