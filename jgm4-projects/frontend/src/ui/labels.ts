// Mapa CENTRAL de rótulos e tons de status. Nenhum enum técnico deve chegar ao usuário: toda tradução passa por aqui
// (o backend continua com os mesmos valores). Sem dependência do Angular, para poder ser testado isoladamente.

export type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

/** Último recurso para valores desconhecidos: transforma WAITING_JGM4_VALIDATION em "Waiting jgm4 validation" (nunca em caixa-alta técnica). */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const pick = (map: Record<string, string>, value: string | null | undefined) => (value ? map[value] ?? humanize(value) : '—');

export const roleLabels: Record<string, string> = {
  JGM4_ADMIN: 'Administrador JGM4', JGM4_CONSULTANT: 'Consultor JGM4', CLIENT_SPONSOR: 'Patrocinador', CLIENT_MANAGER: 'Gestor', CLIENT_USER: 'Operacional', CLIENT_EXECUTIVE: 'Diretoria (leitura)', SYSTEM: 'Sistema', USER: 'Usuário',
};
export const roleLabel = (role: string | null | undefined) => pick(roleLabels, role);

export const projectStatusLabels: Record<string, string> = { PLANNING: 'Planejamento', PLANNED: 'Planejamento', IN_PROGRESS: 'Em andamento', ON_HOLD: 'Em espera', IMPLEMENTATION_COMPLETED: 'Implantação concluída', COMPLETED: 'Implantação concluída', CANCELLED: 'Cancelado' };
export const healthLabels: Record<string, string> = { NORMAL: 'Normal', ATENCAO: 'Atenção', CRITICO: 'Crítico' };
export const alertLabels: Record<string, string> = { NORMAL: '', ATENCAO: 'Atenção', EXCEDIDO: 'Excedido' };
export const phaseStatusLabels: Record<string, string> = { COMPLETED: 'Concluída', IN_PROGRESS: 'Em execução', AVAILABLE: 'Em execução', WAITING_GATE: 'Aguardando Gate', LOCKED: 'Bloqueada', BLOCKED: 'Bloqueada' };
export const gateStatusLabels: Record<string, string> = { BLOCKED: 'Bloqueado', AVAILABLE: 'Disponível para parecer', UNDER_REVIEW: 'Em análise', CORRECTION_REQUIRED: 'Correção necessária', TECHNICALLY_APPROVED: 'Aguardando decisão do patrocinador', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', CLOSED: 'Encerrado' };
export const taskStatusLabels: Record<string, string> = {
  NOT_STARTED: 'Não iniciada', BLOCKED: 'Bloqueada', RELEASED: 'Liberada', IN_PROGRESS: 'Em andamento', WAITING_EVIDENCE: 'Aguardando evidência',
  WAITING_JGM4_VALIDATION: 'Aguardando validação JGM4', WAITING_CLIENT: 'Aguardando cliente', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};
export const requestStatusLabels: Record<string, string> = {
  PLANNED: 'Planejada', BLOCKED: 'Bloqueada', AVAILABLE: 'Disponível', REQUESTED: 'Solicitada à Ollem', CLIENT_PREPARING: 'Ollem preparando', SENT_TO_JGM4: 'Enviada à JGM4',
  JGM4_REVIEW: 'Em análise JGM4', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', ACCEPTED: 'Aceita', CANCELLED: 'Cancelada',
};
export const approvalStatusLabels: Record<string, string> = { PENDING: 'Pendente', IN_REVIEW: 'Em análise', APPROVED: 'Aprovada', ADJUSTMENT_REQUESTED: 'Ajuste solicitado', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' };
export const priorityLabels: Record<string, string> = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', CRITICAL: 'Crítica' };
export const userStatusLabels: Record<string, string> = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', BLOCKED: 'Bloqueado' };
export const companyStatusLabels: Record<string, string> = { ACTIVE: 'Ativa', INACTIVE: 'Inativa' };
export const templateStatusLabels: Record<string, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', INACTIVE: 'Inativo', ARCHIVED: 'Arquivado' };
export const incidentStatusLabels: Record<string, string> = { OPEN: 'Aberto', INVESTIGATING: 'Em investigação', CONTAINED: 'Contido', RESOLVED: 'Resolvido', CLOSED: 'Encerrado' };
export const ownerLabels: Record<string, string> = { JGM4: 'JGM4', CLIENT: 'Cliente', SYSTEM: 'Sistema', NONE: 'Sem ação pendente' };
export const kindLabels: Record<string, string> = { TASK: 'Atividade', REQUEST: 'Solicitação', GATE: 'Gate', CHANGE: 'Alteração' };
export const projectRoleLabels: Record<string, string> = { CONSULTANT_LEAD: 'Consultor principal', CLIENT_SPONSOR: 'Patrocinador', CLIENT_MANAGER: 'Gestor do cliente', TEAM_MEMBER: 'Membro da equipe' };
export const projectRoleLabel = (value: string | null | undefined) => (value ? projectRoleLabels[value] ?? roleLabels[value] ?? humanize(value) : '—');
export const responsibilityLabels: Record<string, string> = { JGM4: 'JGM4', CLIENT: 'Cliente', JOINT: 'Conjunta' };

/** Eventos de segurança (SecurityEvent) e ações de auditoria (AuditLog) em linguagem clara. */
export const securityEventLabels: Record<string, string> = {
  LOGIN_SUCCESS: 'Login realizado', LOGIN_FAILED: 'Falha de login', ACCOUNT_LOCKED: 'Conta bloqueada temporariamente', PASSWORD_CHANGED: 'Senha alterada', PASSWORD_RESET_REQUESTED: 'Redefinição de senha solicitada',
  PASSWORD_RESET: 'Senha redefinida', SESSION_REVOKED: 'Sessão encerrada', SESSION_REFRESH_REUSE: 'Reutilização de sessão detectada', ACCESS_DENIED: 'Acesso negado', MFA_FAILED: 'Falha na verificação em duas etapas',
  MFA_ENABLED: 'Verificação em duas etapas ativada', MFA_DISABLED: 'Verificação em duas etapas desativada', EXPORT_GENERATED: 'Exportação gerada', SENSITIVE_DOWNLOAD: 'Download de arquivo', RATE_LIMITED: 'Limite de tentativas atingido',
  CSRF_REJECTED: 'Requisição rejeitada (CSRF)', USER_STATUS_CHANGED: 'Situação do usuário alterada', USER_ANONYMIZED: 'Usuário anonimizado', USER_CREATED: 'Usuário criado', ATTACHMENT_UPLOADED: 'Anexo enviado',
  ATTACHMENT_REJECTED: 'Anexo rejeitado', REAUTH_FAILED: 'Confirmação de senha falhou', USER_ROLE_CHANGED: 'Perfil do usuário alterado', ADMIN_ACCESS_RESET: 'Acesso redefinido pelo administrador',
  MEMBERSHIP_CHANGED: 'Vínculo com projeto alterado', COMPANY_STATUS_CHANGED: 'Situação da empresa alterada', PROJECT_CREATED: 'Projeto criado',
};
export const entityTypeLabels: Record<string, string> = { Task: 'Atividade', ProjectRequest: 'Solicitação', Gate: 'Gate', Phase: 'Fase', Approval: 'Aprovação', TimeEntry: 'Apontamento de horas', Project: 'Projeto', SustainmentItem: 'Item de sustentação', CarriedOverItem: 'Pendência transferida', ProjectMembership: 'Vínculo com projeto', Company: 'Empresa', User: 'Usuário', ProjectTemplate: 'Template', Proposal: 'Proposta', PhaseCommercial: 'Condição comercial da fase', ExternalDependency: 'Dependência externa' };
export const entityTypeLabel = (type: string) => pick(entityTypeLabels, type);
export const approvalTypeLabels: Record<string, string> = { REQUEST_REVIEW: 'Revisão de solicitação', TASK_VALIDATION: 'Validação de atividade', GATE_TECHNICAL_OPINION: 'Parecer técnico do Gate', GATE_CLIENT_DECISION: 'Decisão do cliente no Gate', DUE_DATE_CHANGE: 'Alteração de prazo', RESPONSIBLE_CHANGE: 'Troca de responsável', TASK_REOPEN: 'Reabertura de atividade', REQUEST_CANCEL: 'Cancelamento de solicitação', OTHER: 'Outro' };
/** "Approval C12 (DUE_DATE_CHANGE)" → "Aprovação C12 (Alteração de prazo)": traduz o tipo da entidade e códigos técnicos entre parênteses. */
export function entityText(text: string | null | undefined): string {
  if (!text) return '—';
  const [type, ...rest] = text.split(' ');
  return [entityTypeLabels[type] ?? type, ...rest].join(' ').replace(/\(([A-Z0-9_]+)\)/g, (_m, code: string) => '(' + (approvalTypeLabels[code] ?? humanize(code)) + ')');
}
export const auditActionLabels: Record<string, string> = {
  OLLEM_PLAN_REVISED: 'Plano Ollem revisado', COMMERCIAL_PHASE_CONFIGURED: 'Condição comercial configurada', SCHEDULE_CONFIGURED: 'Cronograma configurado',
  PROPOSAL_DRAFTED: 'Versão de proposta criada', PROPOSAL_SEND: 'Proposta enviada', PROPOSAL_REVIEW: 'Proposta em revisão', PROPOSAL_REJECT: 'Proposta rejeitada', PROPOSAL_ACCEPT: 'Proposta validada', PROPOSAL_QUESTION_RECORDED: 'Dúvida sobre a proposta registrada',
  CONTRACT_STATUS_RECORDED: 'Situação contratual registrada', COMMERCIAL_START_EXCEPTION: 'Exceção de início autorizada', COMMERCIAL_PROJECT_STARTED: 'Início comercial autorizado',
  EXTERNAL_DEPENDENCY_CREATED: 'Dependência externa cadastrada', EXTERNAL_DEPENDENCY_UPDATED: 'Dependência externa atualizada', STRUCTURAL_MOVEMENT_ACCEPTED: 'Movimentação estrutural autorizada',
  APPROVAL_CREATED: 'Aprovação solicitada', APPROVAL_APPROVED: 'Aprovação concedida', APPROVAL_REJECTED: 'Aprovação rejeitada', APPROVAL_ADJUSTMENT_REQUESTED: 'Ajuste solicitado na aprovação', APPROVAL_CANCELLED: 'Aprovação cancelada', APPROVAL_IN_REVIEW: 'Aprovação em análise', APPROVAL_ON_HOLD: 'Aprovação em espera',
  ADJUSTMENT_REQUESTED: 'Ajuste solicitado', SENT_TO_JGM4: 'Enviado à JGM4', EVIDENCE_ADDED: 'Evidência registrada', TIME_ENTRY_CREATED: 'Horas apontadas', CHECKLIST_CHANGED: 'Checklist atualizado', REQUIREMENT_CHANGED: 'Requisito atualizado',
  DUE_DATE_CHANGED: 'Prazo alterado', DUE_DATE_CHANGE_REQUESTED: 'Alteração de prazo solicitada', DUE_DATE_CHANGE_REJECTED: 'Alteração de prazo rejeitada', DUE_DATE_CHANGE_ADJUSTMENT_REQUESTED: 'Ajuste solicitado na alteração de prazo',
  REOPENED: 'Reaberta', REOPEN_REQUESTED: 'Reabertura solicitada', REOPEN_REJECTED: 'Reabertura rejeitada', REOPEN_ADJUSTMENT_REQUESTED: 'Ajuste solicitado na reabertura',
  RESPONSIBLE_CHANGE_REQUESTED: 'Troca de responsável solicitada', RESPONSIBLE_CHANGE_REJECTED: 'Troca de responsável rejeitada', RESPONSIBLE_CHANGE_ADJUSTMENT_REQUESTED: 'Ajuste solicitado na troca de responsável',
  CANCEL_REQUESTED: 'Cancelamento solicitado', CANCEL_REJECTED: 'Cancelamento rejeitado', CANCEL_ADJUSTMENT_REQUESTED: 'Ajuste solicitado no cancelamento', CANCELLED: 'Cancelado',
  GATE_AVAILABLE: 'Gate disponível', GATE_APPROVED: 'Gate aprovado', GATE_CLIENT_DECISION: 'Decisão do cliente no Gate', GATE_TECHNICAL_OPINION: 'Parecer técnico do Gate', GATE_RETURNED_TO_BLOCKED: 'Gate voltou a bloqueado', TECHNICALLY_APPROVED: 'Aprovado tecnicamente',
  PHASE_STARTED: 'Fase iniciada', PHASE_COMPLETED: 'Fase concluída', PHASE_RELEASED: 'Fase liberada', PHASE_REOPENED: 'Fase reaberta', PHASE_WAITING_GATE: 'Fase aguardando Gate',
  PLAN_UPDATED: 'Plano atualizado', STATUS_CHANGED: 'Situação alterada', IMPLEMENTATION_COMPLETED: 'Implantação concluída', ITEM_CARRIED_OVER: 'Pendência transferida', CARRIED_ITEM_RESOLVED: 'Pendência resolvida', SUSTAINMENT_ITEM_CREATED: 'Item de sustentação criado',
  START_REVIEW: 'Análise iniciada', RESUME_REVIEW: 'Análise retomada', REQUEST_CORRECTION: 'Correção solicitada', TECHNICAL_OPINION: 'Parecer técnico emitido', CLIENT_DECISION: 'Decisão do cliente', CRITERION_UPDATED: 'Critério atualizado', CRITERIA_UPDATED: 'Critério atualizado',
  CLOSED_GATE_EDIT: 'Edição de Gate encerrado', CLOSED_ITEM_REOPEN: 'Reabertura de item encerrado',
  PLAN_CREATED: 'Plano criado', RELEASED: 'Atividade liberada', CREATED: 'Criado', STARTED: 'Iniciada', COMPLETED: 'Concluída', PROJECT_CREATED: 'Projeto criado', PROJECT_UPDATED: 'Projeto atualizado',
  PROJECT_ACTIVATED: 'Projeto ativado', PROJECT_ON_HOLD: 'Projeto suspenso', PROJECT_RESUMED: 'Projeto retomado', PROJECT_CANCELLED: 'Projeto cancelado', PROJECT_CREATED_FROM_TEMPLATE: 'Projeto criado a partir de template',
  MEMBERSHIP_ADDED: 'Vínculo adicionado', MEMBERSHIP_REMOVED: 'Vínculo removido', MEMBERSHIP_UPDATED: 'Vínculo atualizado', MEMBERSHIP_REACTIVATED: 'Vínculo reativado', MEMBERSHIP_DEACTIVATED: 'Vínculo removido', RESPONSIBLE_CHANGED: 'Responsável alterado',
  COMPANY_CREATED: 'Empresa criada', COMPANY_UPDATED: 'Empresa atualizada', COMPANY_ACTIVATED: 'Empresa reativada', COMPANY_DEACTIVATED: 'Empresa inativada', USER_CREATED: 'Usuário criado', USER_UPDATED: 'Usuário atualizado',
  USER_ROLE_CHANGED: 'Perfil alterado', USER_DISABLED: 'Usuário inativado', USER_BLOCKED: 'Usuário bloqueado', USER_ENABLED: 'Usuário reativado', USER_ACCESS_RESET: 'Acesso redefinido',
  TEMPLATE_CREATED: 'Template criado', TEMPLATE_UPDATED: 'Template atualizado', TEMPLATE_VALIDATED: 'Template validado', TEMPLATE_VERSION_CREATED: 'Nova versão de template', TEMPLATE_ACTIVATED: 'Template ativado', TEMPLATE_INACTIVATED: 'Template inativado', TEMPLATE_ARCHIVED: 'Template arquivado',
};

/** Cinza = não iniciado/bloqueado · Azul = disponível/em andamento · Amarelo = aguardando/análise · Vermelho = correção/erro/atraso · Verde = aceito/validado/concluído. */
const TONES: Record<string, Tone> = {
  // neutro
  NOT_STARTED: 'neutral', BLOCKED: 'neutral', LOCKED: 'neutral', PLANNED: 'neutral', PLANNING: 'neutral', DRAFT: 'neutral', INACTIVE: 'neutral', ARCHIVED: 'neutral', CANCELLED: 'neutral', CLOSED: 'neutral', LOW: 'neutral', ON_HOLD: 'warning',
  // azul
  AVAILABLE: 'info', RELEASED: 'info', IN_PROGRESS: 'info', REQUESTED: 'info', CLIENT_PREPARING: 'info', NORMAL: 'success', OPEN: 'info', ACTIVE: 'success',
  // amarelo
  WAITING_EVIDENCE: 'warning', WAITING_JGM4_VALIDATION: 'warning', WAITING_CLIENT: 'warning', WAITING_GATE: 'warning', UNDER_REVIEW: 'warning', IN_REVIEW: 'warning', JGM4_REVIEW: 'warning', SENT_TO_JGM4: 'warning', PENDING: 'warning',
  TECHNICALLY_APPROVED: 'warning', INVESTIGATING: 'warning', CONTAINED: 'warning', ATENCAO: 'warning', HIGH: 'warning',
  // vermelho
  ADJUSTMENT_REQUESTED: 'danger', CORRECTION_REQUIRED: 'danger', REJECTED: 'danger', CRITICO: 'danger', EXCEDIDO: 'danger', CRITICAL: 'danger',
  // verde
  COMPLETED: 'success', ACCEPTED: 'success', APPROVED: 'success', IMPLEMENTATION_COMPLETED: 'success', RESOLVED: 'success',
};
export const toneOf = (status: string | null | undefined): Tone => (status ? TONES[status] ?? 'neutral' : 'neutral');
/** Rótulo + tom de qualquer status do sistema, escolhendo o domínio pelo nome. */
export type StatusDomain = 'project' | 'phase' | 'gate' | 'task' | 'request' | 'approval' | 'user' | 'company' | 'template' | 'incident' | 'health' | 'priority';
const DOMAINS: Record<StatusDomain, Record<string, string>> = { project: projectStatusLabels, phase: phaseStatusLabels, gate: gateStatusLabels, task: taskStatusLabels, request: requestStatusLabels, approval: approvalStatusLabels, user: userStatusLabels, company: companyStatusLabels, template: templateStatusLabels, incident: incidentStatusLabels, health: healthLabels, priority: priorityLabels };
export function statusLabel(domain: StatusDomain, status: string | null | undefined) { return pick(DOMAINS[domain], status); }
export const securityEventLabel = (type: string) => pick(securityEventLabels, type);
export const auditActionLabel = (action: string) => pick(auditActionLabels, action);

/** Itens de menu por perfil (testável): o que cada papel enxerga no menu lateral. */
export interface NavItem { id: string; label: string; link: string; group: 'principal' | 'gestao' | 'administracao' }
export function navigationFor(role: string | null | undefined, opts: { dev?: boolean; projectId?: string | null } = {}): NavItem[] {
  if (!role) return [];
  const jgm4 = role.startsWith('JGM4') || !!opts.dev; const admin = role === 'JGM4_ADMIN' || !!opts.dev;
  const items: NavItem[] = [];
  if (jgm4) items.push({ id: 'dashboard', label: 'Dashboard', link: '/dashboard', group: 'principal' });
  items.push({ id: 'projects', label: 'Projetos', link: '/projects', group: 'principal' }, { id: 'approvals', label: 'Aprovações', link: '/approvals', group: 'principal' });
  if (opts.projectId) items.push({ id: 'proposal', label: 'Proposta', link: `/projects/${opts.projectId}/proposal`, group: 'gestao' }, { id: 'reports', label: 'Relatórios', link: `/projects/${opts.projectId}/reports`, group: 'gestao' }, { id: 'audit', label: 'Auditoria', link: `/projects/${opts.projectId}/audit`, group: 'gestao' });
  if (admin) items.push(
    { id: 'admin-companies', label: 'Empresas', link: '/admin/companies', group: 'administracao' }, { id: 'admin-users', label: 'Usuários', link: '/admin/users', group: 'administracao' },
    { id: 'admin-projects', label: 'Projetos', link: '/admin/projects', group: 'administracao' }, { id: 'admin-templates', label: 'Templates', link: '/admin/templates', group: 'administracao' },
    { id: 'admin-security', label: 'Segurança', link: '/admin/security', group: 'administracao' });
  return items;
}

/** Mensagem amigável para erros de API: explica o que houve e o que fazer, sem detalhe técnico. */
export function friendlyError(status: number | undefined, serverMessage: string | undefined, what = 'concluir a operação'): string {
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 403) return 'Você não possui permissão para realizar esta ação.';
  if (status === 404) return 'O item solicitado não foi encontrado.';
  if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.';
  if (!status || status >= 500) return `Não foi possível ${what}. Verifique sua conexão e tente novamente.`;
  return serverMessage || `Não foi possível ${what}. Revise os dados e tente novamente.`;
}
