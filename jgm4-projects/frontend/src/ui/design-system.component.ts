import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UI } from './ui.components';
import { DialogService } from './dialog.service';
import { statusLabel } from './labels';

// Página de referência do Design System (rota /dev/design-system, somente fora de produção).
@Component({
  selector: 'app-design-system', imports: [FormsModule, ...UI],
  template: `<main data-testid="design-system">
    <ui-page-header eyebrow="DESIGN SYSTEM" title="Componentes e estados" subtitle="Referência visual da Etapa 10.5. Esta página só existe em desenvolvimento." [breadcrumb]="[{ label: 'Início', link: '/' }, { label: 'Design System' }]" />

    <ui-card title="Cores" eyebrow="TOKENS">
      <div class="ds-swatches">@for (c of colors; track c.name) { <div class="ds-swatch"><span [style.background]="'var(' + c.token + ')'"></span><strong>{{ c.name }}</strong><small>{{ c.token }}</small></div> }</div></ui-card>

    <ui-card title="Tipografia" eyebrow="TOKENS"><h1>H1 — Título da página</h1><h2>H2 — Título de seção</h2><h3>H3 — Subtítulo</h3><p>Corpo (14 px): texto corrido para descrições e instruções.</p><p class="text-muted">Texto secundário e ajuda (13 px).</p><small>Legenda (12 px)</small></ui-card>

    <ui-card title="Botões" eyebrow="COMPONENTES"><div class="action-buttons"><button type="button">Primário</button><button type="button" class="secondary">Secundário</button><button type="button" class="tertiary">Terciário</button><button type="button" class="danger">Perigo</button><button type="button" class="danger solid">Perigo (sólido)</button><button type="button" class="is-loading">Carregando</button><button type="button" disabled>Desabilitado</button></div></ui-card>

    <ui-card title="Status" eyebrow="COMPONENTES"><p class="text-muted">Cinza: não iniciado/bloqueado · Azul: disponível/andamento · Amarelo: aguardando/análise · Vermelho: correção/erro/atraso · Verde: aceito/concluído.</p>
      <div class="action-buttons">@for (s of statuses; track s) { <ui-badge [status]="s" [label]="label(s)" /> }</div></ui-card>

    <ui-card title="Indicadores e progresso" eyebrow="COMPONENTES"><div class="stat-grid"><ui-stat-card label="Progresso" value="78%" hint="26 de 33 atividades" /><ui-stat-card label="Horas JGM4" value="36 h" hint="Planejado 36 h · saldo 0 h" tone="warning" /><ui-stat-card label="Atrasados" value="2" hint="itens com prazo vencido" tone="danger" /></div><ui-progress [value]="62" caption="62% concluído" [big]="true" /></ui-card>

    <ui-card title="Alertas" eyebrow="COMPONENTES"><ui-alert tone="info" title="Informação">Mensagem informativa.</ui-alert><ui-alert tone="success" title="Sucesso">Operação concluída.</ui-alert><ui-alert tone="warning" title="Atenção">Revise antes de continuar.</ui-alert><ui-alert tone="danger" title="Erro">Não foi possível carregar o projeto. Verifique sua conexão e tente novamente.</ui-alert></ui-card>

    <ui-card title="Formulário" eyebrow="COMPONENTES"><div class="form-grid"><ui-field label="Nome" for="ds-name" help="Como aparece nas listas." [required]="true"><input id="ds-name" [(ngModel)]="sample"></ui-field><ui-field label="Perfil" for="ds-role"><select id="ds-role"><option>Consultor JGM4</option><option>Gestor</option></select></ui-field><ui-field label="E-mail" for="ds-mail" error="Informe um e-mail válido."><input id="ds-mail" type="email" value="invalido"></ui-field></div></ui-card>

    <ui-card title="Tabela (vira cartões no celular)" eyebrow="COMPONENTES"><div class="request-table-wrap"><table class="request-table stack-table"><thead><tr><th>Código</th><th>Título</th><th>Situação</th><th></th></tr></thead><tbody><tr><td data-label="Código"><span class="code-link">SOL-006</span></td><td data-label="Título">Levantamento dimensional<small>Fase 0</small></td><td data-label="Situação"><ui-badge status="CLIENT_PREPARING" domain="request" /></td><td class="row-actions"><button type="button" class="tertiary">Abrir</button></td></tr></tbody></table></div></ui-card>

    <ui-card title="Estados" eyebrow="COMPONENTES"><ui-empty icon="✓" title="Nenhuma aprovação pendente" message="Quando houver algo para decidir, aparecerá aqui." /><div style="margin-top: 16px"><ui-loading message="Carregando o painel do projeto…" /></div><div style="margin-top: 16px"><ui-skeleton [lines]="3" /></div></ui-card>

    <ui-card title="Navegação e usuário" eyebrow="COMPONENTES"><ui-tabs label="Exemplo" [tabs]="[{ label: 'Painel', link: '/dev/design-system' }, { label: 'Plano', link: '/dev/design-system' }]" /><ui-user-badge name="Maria Souza" subtitle="Gestor · Empresa Exemplo" /></ui-card>

    <ui-card title="Diálogos" eyebrow="COMPONENTES"><div class="action-buttons"><button type="button" class="secondary" (click)="confirm()" data-testid="ds-confirm">Confirmação</button><button type="button" class="danger" (click)="prompt()" data-testid="ds-prompt">Ação crítica com motivo</button></div>@if (answer) { <p class="text-muted" data-testid="ds-answer">{{ answer }}</p> }</ui-card>
  </main>`,
})
export class DesignSystemComponent {
  private readonly dialogs = inject(DialogService);
  sample = 'Maria Souza'; answer = '';
  readonly statuses = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING_JGM4_VALIDATION', 'ADJUSTMENT_REQUESTED', 'COMPLETED'];
  readonly colors = [{ name: 'Primária', token: '--primary' }, { name: 'Primária escura', token: '--primary-dark' }, { name: 'Primária clara', token: '--primary-light' }, { name: 'Destaque', token: '--accent' }, { name: 'Sucesso', token: '--success' }, { name: 'Atenção', token: '--warning' }, { name: 'Perigo', token: '--danger' }, { name: 'Informação', token: '--info' },
    { name: 'Fundo', token: '--bg' }, { name: 'Superfície', token: '--surface-2' }, { name: 'Borda', token: '--border' }, { name: 'Texto', token: '--text' }, { name: 'Texto secundário', token: '--text-2' }, { name: 'Texto suave', token: '--text-muted' }];
  label(status: string) { return statusLabel('task', status); }
  async confirm() { this.answer = (await this.dialogs.confirm({ title: 'Concluir a atividade?', message: 'A atividade será enviada para validação da JGM4.', confirmLabel: 'Enviar' })) ? 'Confirmado.' : 'Cancelado.'; }
  async prompt() { const reason = await this.dialogs.prompt({ title: 'Inativar usuário', message: 'O usuário perde o acesso imediatamente.', label: 'Motivo', multiline: true, confirmLabel: 'Inativar', danger: true }); this.answer = reason ? `Motivo: ${reason}` : 'Cancelado.'; }
}
