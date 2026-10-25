import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Project } from './project.types';
import { ProjectNavComponent } from './project-nav.component';
import { alignmentSections, alignmentSummary } from './alignment.data';
import { AlignmentDraft, alignmentDocument } from './alignment-document';

@Component({
  selector: 'app-alignment', imports: [FormsModule, ProjectNavComponent],
  template: `<main class="alignment-page">
    <img class="print-brand" src="assets/brand/logo-jgm4.png" alt="JGM4 Consultoria Logística" width="96" height="96">
    <div class="page-heading"><div><p class="eyebrow">PLANO C · {{ project()?.company?.name }}</p><h1>Reunião de alinhamento</h1><p class="lead">Confirme papéis, Gates e disponibilidade da equipe.</p></div><div class="action-buttons no-print"><button [disabled]="!project() || downloading()" (click)="download()">Baixar documento preenchível</button><button class="secondary" [disabled]="!project()" (click)="print()">Imprimir / PDF</button></div></div>
    <app-project-nav [projectId]="projectId" />
    @if (project()?.ollemRevision) { <p class="scope-note">Este roteiro preserva o alinhamento anterior à revisão. Fases, cronograma e condições atuais estão na <a [href]="'/projects/' + projectId + '/proposal'">proposta revisada</a>. Respostas anteriores continuam preservadas.</p> }
    @if (error()) { <div class="alert-box" role="alert">{{ error() }}</div> }
    @if (project(); as current) {
      <section class="panel"><h2>{{ current.name }}</h2><p class="lead">JGM4 estrutura → Ollem executa → JGM4 acompanha → ambas validam → próximo Gate.</p><div class="meeting-meta"><div><label for="meeting-date">Data da reunião</label><input id="meeting-date" type="date" [(ngModel)]="draft.date" (ngModelChange)="save()"></div><div><label for="meeting-participants">Participantes</label><input id="meeting-participants" type="text" maxlength="2000" [(ngModel)]="draft.participants" (ngModelChange)="save()" placeholder="Nomes e cargos"></div></div><p class="save-notice" role="status">{{ saveMessage() }}</p><p class="scope-note">As respostas ficam somente neste navegador e neste projeto. Baixe o documento para guardar ou compartilhar. Este roteiro não altera solicitações nem aprova Gates.</p></section>
      <nav class="meeting-index no-print" aria-label="Seções do roteiro">@for (section of sections; track $index) { <a [href]="'#section-' + $index">{{ $index + 1 }}. {{ section.title }}</a> }<a href="#meeting-summary">Síntese da reunião</a></nav>
      @for (section of sections; track $index; let i = $index) {
        <section class="panel meeting-section" [id]="'section-' + i" data-testid="alignment-section"><p class="eyebrow">ALINHAMENTO {{ i + 1 }} / {{ sections.length }}</p><h2>{{ section.title }}</h2><p class="body-copy">{{ section.explanation }}</p>@if (section.topics) { <ul class="meeting-topics">@for (topic of section.topics; track topic) { <li>{{ topic }}</li> }</ul> }
          @for (question of section.questions; track $index; let j = $index) { <label [for]="'s' + i + 'q' + j">{{ question }}</label><textarea [id]="'s' + i + 'q' + j" rows="3" maxlength="10000" [(ngModel)]="draft.answers['s' + i + 'q' + j]" (ngModelChange)="save()" placeholder="Registrar resposta, concordância ou ressalvas…"></textarea><p class="print-answer">{{ draft.answers['s' + i + 'q' + j] || 'Resposta a registrar.' }}</p> }
        </section>
      }
      <section id="meeting-summary" class="panel meeting-section"><p class="eyebrow">CONSOLIDAÇÃO</p><h2>O que ficou definido</h2><p class="lead">Complete os pontos necessários para dimensionar o esforço por fase.</p>@for (question of summary; track $index; let i = $index) { <label [for]="'summary' + i">{{ question }}</label><textarea [id]="'summary' + i" rows="2" maxlength="10000" [(ngModel)]="draft.answers['summary' + i]" (ngModelChange)="save()"></textarea><p class="print-answer">{{ draft.answers['summary' + i] || 'A definir.' }}</p> }</section>
      <div class="action-buttons no-print"><button [disabled]="downloading()" (click)="download()">Baixar documento preenchível</button><button class="secondary" (click)="print()">Imprimir / PDF</button></div>
    } @else if (!error()) { <section class="state-panel" aria-live="polite">Carregando roteiro do projeto…</section> }
  </main>`,
})
export class AlignmentComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  readonly sections = alignmentSections; readonly summary = alignmentSummary;
  readonly project = signal<Project | null>(null); readonly error = signal(''); readonly saveMessage = signal('Rascunho ainda não preenchido.');
  readonly downloading = signal(false);
  projectId = ''; draft: AlignmentDraft = { date: '', participants: '', answers: {} };
  private key() { return `jgm4-alignment-v1:${this.projectId}`; }
  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id')!;
    try {
      const saved = localStorage.getItem(this.key());
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const value = parsed as Partial<AlignmentDraft>;
          this.draft = { date: typeof value.date === 'string' ? value.date : '', participants: typeof value.participants === 'string' ? value.participants : '', answers: Object.fromEntries(Object.entries(value.answers || {}).filter(([, answer]) => typeof answer === 'string')) };
          this.saveMessage.set('Rascunho recuperado deste navegador.');
        }
      }
    } catch { this.saveMessage.set('Não foi possível recuperar o rascunho local. Baixe o documento para guardar as respostas.'); }
    this.http.get<Project>(`/api/projects/${this.projectId}`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (project) => this.project.set(project), error: () => this.error.set('Não foi possível carregar este projeto. Volte ao início e verifique a conexão.') });
  }
  save() { try { localStorage.setItem(this.key(), JSON.stringify(this.draft)); this.saveMessage.set('Rascunho salvo neste navegador.'); } catch { this.saveMessage.set('Não foi possível salvar neste navegador. Baixe o documento para guardar as respostas.'); } }
  async download() {
    const project = this.project(); if (!project || this.downloading()) return;
    this.downloading.set(true); this.error.set('');
    try {
      const response = await fetch('/assets/brand/logo-jgm4.png');
      if (!response.ok) throw new Error('Logo indisponível.');
      const blob = await response.blob();
      const logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Logo inválida.'));
        reader.onerror = () => reject(new Error('Não foi possível ler a logo.'));
        reader.readAsDataURL(blob);
      });
      const url = URL.createObjectURL(new Blob([alignmentDocument(project.company.name, project.name, this.draft, logoDataUrl)], { type: 'text/html;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `alinhamento-plano-c-${this.projectId}.html`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { this.error.set('Não foi possível preparar o documento com a logo. Tente novamente.'); }
    finally { this.downloading.set(false); }
  }
  print() { window.print(); }
}
