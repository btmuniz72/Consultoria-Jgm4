import { Component, ElementRef, Injectable, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface DialogField { name: string; label: string; type?: 'text' | 'textarea' | 'select' | 'password'; required?: boolean; options?: { value: string; label: string }[]; value?: string; help?: string }
export interface DialogRequest { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; fields?: DialogField[] }
interface Open extends DialogRequest { resolve: (value: Record<string, string> | null) => void }

/**
 * Diálogos consistentes (substituem confirm/prompt do navegador). A segurança continua no backend: estes diálogos só coletam motivo/confirmação;
 * senha e MFA de ações críticas continuam sendo enviados à API, que os valida.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<Open | null>(null);
  ask(request: DialogRequest): Promise<Record<string, string> | null> {
    return new Promise((resolve) => { this.current.set({ ...request, resolve: (value) => { this.current.set(null); resolve(value); } }); });
  }
  async confirm(request: Omit<DialogRequest, 'fields'>): Promise<boolean> { return (await this.ask(request)) !== null; }
  /** Pede um texto (ex.: motivo). Devolve null se cancelar. */
  async prompt(request: { title: string; message?: string; label: string; multiline?: boolean; value?: string; confirmLabel?: string; danger?: boolean }): Promise<string | null> {
    const result = await this.ask({ title: request.title, message: request.message, confirmLabel: request.confirmLabel, danger: request.danger, fields: [{ name: 'value', label: request.label, type: request.multiline ? 'textarea' : 'text', required: true, value: request.value }] });
    return result ? result['value'] : null;
  }
}

@Component({
  selector: 'ui-dialog-host', imports: [FormsModule],
  template: `@if (dialogs.current(); as d) {
    <div class="dialog-backdrop" (click)="cancel()" data-testid="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" data-testid="dialog" (click)="$event.stopPropagation()" (keydown.escape)="cancel()" (keydown)="trap($event)" #box>
        <h2 id="dialog-title">{{ d.title }}</h2>
        @if (d.message) { <p>{{ d.message }}</p> }
        <form (ngSubmit)="submit()" #form="ngForm" novalidate>
          @for (f of d.fields ?? []; track f.name) {
            <div class="field"><label [attr.for]="'dlg-' + f.name">{{ f.label }}@if (f.required) { <span aria-hidden="true"> *</span> }</label>
              @switch (f.type) {
                @case ('textarea') { <textarea [id]="'dlg-' + f.name" [name]="f.name" rows="3" [(ngModel)]="values[f.name]" [attr.data-testid]="'dialog-' + f.name" autofocus></textarea> }
                @case ('select') { <select [id]="'dlg-' + f.name" [name]="f.name" [(ngModel)]="values[f.name]" [attr.data-testid]="'dialog-' + f.name">@for (o of f.options ?? []; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select> }
                @case ('password') { <input type="password" [id]="'dlg-' + f.name" [name]="f.name" [(ngModel)]="values[f.name]" autocomplete="current-password" [attr.data-testid]="'dialog-' + f.name"> }
                @default { <input type="text" [id]="'dlg-' + f.name" [name]="f.name" [(ngModel)]="values[f.name]" [attr.data-testid]="'dialog-' + f.name"> }
              }
              @if (f.help) { <span class="field-help">{{ f.help }}</span> }
              @if (submitted && f.required && !(values[f.name] || '').trim()) { <span class="field-error" role="alert">Campo obrigatório.</span> }</div>
          }
          <div class="action-buttons"><button type="button" class="secondary" (click)="cancel()" data-testid="dialog-cancel">{{ d.cancelLabel || 'Cancelar' }}</button><button type="submit" [class.danger]="d.danger" [class.solid]="d.danger" data-testid="dialog-confirm">{{ d.confirmLabel || 'Confirmar' }}</button></div>
        </form>
      </div>
    </div>
  }`,
})
export class DialogHostComponent {
  readonly dialogs = inject(DialogService); values: Record<string, string> = {}; submitted = false; private lastId: unknown = null;
  @ViewChild('box') set box(element: ElementRef<HTMLElement> | undefined) {
    const current = this.dialogs.current();
    if (element && current && this.lastId !== current) { this.lastId = current; this.submitted = false; this.values = Object.fromEntries((current.fields ?? []).map((f) => [f.name, f.value ?? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '')])); setTimeout(() => (element.nativeElement.querySelector('input,textarea,select') as HTMLElement | null ?? element.nativeElement.querySelector('button[type=submit]') as HTMLElement | null)?.focus()); }
    if (!element) this.lastId = null;
  }
  submit() {
    const current = this.dialogs.current(); if (!current) return; this.submitted = true;
    if ((current.fields ?? []).some((f) => f.required && !(this.values[f.name] || '').trim())) return;
    current.resolve({ ...this.values });
  }
  cancel() { this.dialogs.current()?.resolve(null); }
  /** Mantém o foco dentro do diálogo enquanto ele está aberto. */
  trap(event: KeyboardEvent) {
    if (event.key !== 'Tab') return; const box = (event.currentTarget as HTMLElement); const focusable = Array.from(box.querySelectorAll<HTMLElement>('input,textarea,select,button:not([disabled])'));
    if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
