import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap, tap } from 'rxjs';
import { apiUrl } from './api-path';
import { ProjectNavComponent } from './project-nav.component';

interface ProjectFile { id: string; name: string; sizeBytes: number; available: boolean; uploadedAt: string; uploadedBy: string | null; entityType: string; entityId: string }

@Component({
  selector: 'app-project-documents', imports: [DatePipe, DecimalPipe, ProjectNavComponent],
  template: `<main>
    @if (projectId()) { <app-project-nav [projectId]="projectId()!" /> }
    <div class="page-heading"><div><p class="eyebrow">ARQUIVOS DO PROJETO</p><h1>Documentos</h1><p>Arquivos compartilhados nas atividades e solicitações deste projeto.</p></div></div>
    @if (loading()) { <section class="state-panel" aria-live="polite"><span class="loader"></span><h2>Carregando documentos…</h2></section> }
    @else if (error()) { <section class="state-panel" role="alert"><h2>Documentos indisponíveis</h2><p>{{ error() }}</p><button type="button" (click)="reload()">Tentar novamente</button></section> }
    @else { <section class="task-panel" data-testid="project-documents"><ul class="history-list">@for (file of files(); track file.id) { <li><div><strong>{{ file.name }}</strong><span>{{ file.sizeBytes / 1024 | number:'1.0-0' }} KB · {{ file.uploadedBy || '—' }} · {{ file.uploadedAt | date:'dd/MM/yyyy HH:mm' }} · {{ file.entityType === 'Task' ? 'Atividade' : 'Solicitação' }}</span></div>@if (file.available) { <a class="quiet-button" [href]="downloadUrl(file.id)">Baixar</a> } @else { <span class="badge">Em verificação</span> }</li> } @empty { <li class="muted-copy">Ainda não há documentos compartilhados neste projeto.</li> }</ul></section> }
  </main>`,
})
export class ProjectDocumentsComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  readonly projectId = signal<string | null>(null); readonly files = signal<ProjectFile[]>([]); readonly loading = signal(true); readonly error = signal('');
  ngOnInit() {
    this.route.paramMap.pipe(switchMap((params) => {
      const id = params.get('id'); this.projectId.set(id);
      if (!id) { this.error.set('O endereço do projeto está incompleto.'); this.loading.set(false); return EMPTY; }
      this.loading.set(true); this.error.set(''); this.files.set([]);
      return this.http.get<ProjectFile[]>(apiUrl(`/projects/${encodeURIComponent(id)}/attachments`)).pipe(tap((files) => this.files.set(files)), catchError((error: HttpErrorResponse) => { this.error.set(error.status === 403 || error.status === 404 ? 'Você não possui acesso aos documentos deste projeto.' : 'Não foi possível consultar os documentos. Verifique sua conexão e tente novamente.'); this.loading.set(false); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loading.set(false));
  }
  downloadUrl(id: string) { return apiUrl(`/projects/${encodeURIComponent(this.projectId() ?? '')}/attachments/${encodeURIComponent(id)}/download`); }
  reload() { const id = this.projectId(); if (!id) return; this.loading.set(true); this.error.set(''); this.http.get<ProjectFile[]>(apiUrl(`/projects/${encodeURIComponent(id)}/attachments`)).pipe(takeUntilDestroyed(this.destroyRef), catchError((error: HttpErrorResponse) => { this.error.set(error.status === 403 || error.status === 404 ? 'Você não possui acesso aos documentos deste projeto.' : 'Não foi possível consultar os documentos. Verifique sua conexão e tente novamente.'); this.loading.set(false); return EMPTY; })).subscribe((files) => { this.files.set(files); this.loading.set(false); }); }
}
