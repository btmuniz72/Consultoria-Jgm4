import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { ProjectNavComponent } from './project-nav.component';
import { friendlyError } from './ui/labels';

@Component({
  selector: 'app-proposal', imports: [DatePipe, FormsModule, ProjectNavComponent],
  templateUrl: './proposal.component.html', styleUrl: './proposal.component.css',
})
export class ProposalComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly route = inject(ActivatedRoute); readonly auth = inject(AuthService);
  readonly data = signal<any>(null); readonly error = signal(''); readonly notice = signal(''); readonly busy = signal(false); readonly selected = signal('');
  projectId = ''; checks = [false, false, false, false, false]; question = ''; rejection = ''; draftNotes = ''; validUntil = ''; exception = '';
  configurations: any[] = []; contract = { status: 'NOT_CREATED', reference: '' };
  dependencyId = ''; dependency = this.emptyDependency();
  readonly statuses: Record<string, string> = { DRAFT: 'Rascunho', SENT: 'Enviada', UNDER_REVIEW: 'Em revisão', APPROVED: 'Validada', REJECTED: 'Rejeitada', SUPERSEDED: 'Substituída', NOT_CREATED: 'Não criado', SENT_FOR_SIGNATURE: 'Enviado para assinatura', SIGNED: 'Assinado', CANCELLED: 'Cancelado', PLANNED: 'Planejada', IN_PROGRESS: 'Em andamento', WAITING_EXTERNAL: 'Aguardando terceiro', COMPLETED: 'Concluída' };
  readonly stages = ['Definição técnica', 'Orçamento', 'Aprovação Ollem', 'Compra/contratação', 'Prazo fornecedor', 'Recebimento', 'Instalação', 'Validação'];
  readonly dependencyStatuses = ['PLANNED', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED'];
  ngOnInit() { this.projectId = this.route.snapshot.paramMap.get('id')!; void this.load(); }
  admin() { return this.auth.user()?.role === 'JGM4_ADMIN'; }
  sponsor() { return this.auth.user()?.role === 'CLIENT_SPONSOR'; }
  canManageDependencies() { return ['JGM4_ADMIN', 'JGM4_CONSULTANT', 'CLIENT_MANAGER', 'CLIENT_SPONSOR'].includes(this.auth.user()?.role ?? ''); }
  proposal(): any { return this.data()?.proposals.find((p: any) => p.id === this.selected()) ?? null; }
  content(): any { return this.proposal()?.snapshot ?? this.data()?.preview; }
  label(value: string) { return this.statuses[value] ?? 'A definir'; }
  money(value: number | null | undefined) { return value === null || value === undefined ? 'A configurar' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
  canDecide() { const p = this.proposal(); return p && ['SENT', 'UNDER_REVIEW'].includes(p.status) && this.data().proposals.filter((x: any) => x.status !== 'DRAFT')[0]?.id === p.id; }
  allChecked() { return this.checks.every(Boolean); }
  tasks(): any[] { return this.data()?.preview.phases.flatMap((p: any) => p.tasks) ?? []; }
  async load() {
    try {
      const d = await firstValueFrom(this.http.get<any>(`/api/projects/${this.projectId}/proposal`)); this.data.set(d);
      if (!this.selected()) this.selected.set(d.proposals[0]?.id ?? 'preview');
      this.configurations = d.preview.phases.map((p: any) => { const c = d.conditions.find((x: any) => x.phaseId === p.id); return { ...p, homeOfficeHours: p.homeOfficeHours, inCompanyHours: p.inCompanyHours, dueDate: p.dueDate?.slice(0, 10) ?? '', plannedStartDate: p.plannedStartDate?.slice(0, 10) ?? '', plannedEndDate: p.plannedEndDate?.slice(0, 10) ?? '', conditionMet: c?.conditionMet ?? false, conditionNote: c?.conditionNote ?? '' }; });
      this.contract = { status: d.project.contractStatus, reference: d.project.contractReference ?? '' };
    } catch (e) { this.showError(e); }
  }
  choose(value: string) { this.selected.set(value); this.checks = [false, false, false, false, false]; }
  private showError(e: unknown) { const error = e as HttpErrorResponse; this.error.set(friendlyError(error.status, Array.isArray(error.error?.message) ? error.error.message.join(' ') : error.error?.message)); }
  async mutate(method: 'post' | 'patch', path: string, body: unknown, success: string) {
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { const result: any = await firstValueFrom(this.http.request(method, `/api/projects/${this.projectId}/${path}`, { body })); if (path === 'proposals') this.selected.set(result.id); await this.load(); this.notice.set(success); return true; }
    catch (e) { this.showError(e); return false; } finally { this.busy.set(false); }
  }
  savePhase(p: any) { return this.mutate('patch', `commercial/phases/${p.id}`, { homeOfficeHours: p.homeOfficeHours, inCompanyHours: p.inCompanyHours, entryPercent: p.entryPercent, ...(p.dueDate ? { dueDate: p.dueDate } : {}), paymentCondition: p.paymentCondition, blocking: p.blocking, conditionMet: p.conditionMet, conditionNote: p.conditionNote }, 'Configuração comercial salva. Emita nova versão para apresentar as mudanças à Ollem.'); }
  saveSchedule(p: any) { return this.mutate('patch', `commercial/phases/${p.id}/schedule`, { ...(p.plannedStartDate ? { plannedStartDate: p.plannedStartDate } : {}), ...(p.plannedEndDate ? { plannedEndDate: p.plannedEndDate } : {}) }, 'Cronograma salvo. Propostas anteriores preservadas.'); }
  draft() { return this.mutate('post', 'proposals', { notes: this.draftNotes, ...(this.validUntil ? { validUntil: this.validUntil } : {}) }, 'Nova versão preparada para leitura.'); }
  send() { return this.mutate('post', `proposals/${this.proposal().id}/send`, {}, 'Proposta enviada para análise da Ollem.'); }
  review() { return this.mutate('post', `proposals/${this.proposal().id}/review`, {}, 'Proposta em revisão.'); }
  async comment() { if (await this.mutate('post', `proposals/${this.proposal().id}/comments`, { text: this.question }, 'Dúvida registrada.')) this.question = ''; }
  accept() { const p = this.proposal(); return this.mutate('post', `proposals/${p.id}/accept`, { version: p.version, contentHash: p.contentHash, acknowledgements: this.checks }, 'Proposta validada — aguardando formalização contratual.'); }
  reject() { return this.mutate('post', `proposals/${this.proposal().id}/reject`, { text: this.rejection }, 'Rejeição registrada com justificativa.'); }
  saveContract() { return this.mutate('patch', 'commercial/contract', this.contract, 'Situação contratual registrada.'); }
  start() { return this.mutate('post', 'commercial/start', {}, 'Início comercial autorizado e registrado.'); }
  startException() { return this.mutate('post', 'commercial/start-exception', { text: this.exception }, 'Exceção formal registrada e início autorizado.'); }
  emptyDependency() { return { description: '', responsible: '', supplier: '', dueDate: '', impact: '', status: 'PLANNED', blocksProject: false, blocksTask: false, taskId: '', stage: 'Definição técnica', note: '' }; }
  editDependency(d: any) { this.dependencyId = d.id; this.dependency = { description: d.description, responsible: d.responsible, supplier: d.supplier ?? '', dueDate: d.dueDate?.slice(0, 10) ?? '', impact: d.impact, status: d.status, blocksProject: d.blocksProject, blocksTask: d.blocksTask, taskId: d.taskId ?? '', stage: d.stage, note: d.note ?? '' }; }
  async saveDependency() { const { dueDate, taskId, ...rest } = this.dependency; if (await this.mutate(this.dependencyId ? 'patch' : 'post', `external-dependencies${this.dependencyId ? '/' + this.dependencyId : ''}`, { ...rest, ...(dueDate ? { dueDate } : {}), ...(taskId ? { taskId } : {}) }, 'Dependência externa registrada.')) { this.dependencyId = ''; this.dependency = this.emptyDependency(); } }
}
