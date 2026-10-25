import { auditActionLabel, friendlyError, humanize, navigationFor, projectRoleLabels, roleLabel, securityEventLabel, statusLabel, toneOf } from '../src/ui/labels';
import { fmtDate, fmtDateTime, fmtHours, fmtPercent, initials } from '../src/ui/format';

describe('Etapa 10.5 — rótulos, tons e formatação centralizados', () => {
  it('traduz perfis sem expor o enum técnico', () => {
    expect(roleLabel('JGM4_ADMIN')).toBe('Administrador JGM4'); expect(roleLabel('JGM4_CONSULTANT')).toBe('Consultor JGM4');
    expect(roleLabel('CLIENT_SPONSOR')).toBe('Patrocinador'); expect(roleLabel('CLIENT_MANAGER')).toBe('Gestor'); expect(roleLabel('CLIENT_USER')).toBe('Usuário');
    expect(roleLabel(null)).toBe('—'); expect(Object.values(projectRoleLabels).join(' ')).not.toMatch(/_/);
  });
  it('nenhum rótulo de status contém underscore ou caixa-alta técnica; valores desconhecidos são humanizados', () => {
    const samples: [Parameters<typeof statusLabel>[0], string][] = [['task', 'WAITING_JGM4_VALIDATION'], ['task', 'ADJUSTMENT_REQUESTED'], ['request', 'CLIENT_PREPARING'], ['gate', 'TECHNICALLY_APPROVED'], ['project', 'IMPLEMENTATION_COMPLETED'], ['approval', 'IN_REVIEW'], ['user', 'BLOCKED'], ['template', 'ARCHIVED'], ['incident', 'INVESTIGATING']];
    for (const [domain, status] of samples) { const label = statusLabel(domain, status); expect(label).not.toMatch(/_/); expect(label).not.toBe(status); expect(label).not.toMatch(/^[A-Z0-9 ]+$/); }
    expect(statusLabel('task', 'WAITING_JGM4_VALIDATION')).toBe('Aguardando validação JGM4');
    expect(humanize('SOME_NEW_STATUS')).toBe('Some new status'); expect(statusLabel('task', 'SOME_NEW_STATUS')).toBe('Some new status');
  });
  it('agrupa os status por tom semântico (cinza, azul, amarelo, vermelho, verde)', () => {
    expect(toneOf('NOT_STARTED')).toBe('neutral'); expect(toneOf('BLOCKED')).toBe('neutral'); expect(toneOf('IN_PROGRESS')).toBe('info'); expect(toneOf('AVAILABLE')).toBe('info');
    expect(toneOf('WAITING_EVIDENCE')).toBe('warning'); expect(toneOf('UNDER_REVIEW')).toBe('warning'); expect(toneOf('ADJUSTMENT_REQUESTED')).toBe('danger'); expect(toneOf('CORRECTION_REQUIRED')).toBe('danger');
    expect(toneOf('ACCEPTED')).toBe('success'); expect(toneOf('COMPLETED')).toBe('success'); expect(toneOf('APPROVED')).toBe('success'); expect(toneOf('QUALQUER_OUTRO')).toBe('neutral'); expect(toneOf(null)).toBe('neutral');
  });
  it('traduz eventos de segurança e ações de auditoria', () => {
    expect(securityEventLabel('LOGIN_FAILED')).toBe('Falha de login'); expect(auditActionLabel('PROJECT_CREATED_FROM_TEMPLATE')).toBe('Projeto criado a partir de template');
    expect(auditActionLabel('ALGUMA_ACAO_NOVA')).toBe('Alguma acao nova');
  });
  it('menu por permissão: administração só para JGM4_ADMIN; relatórios/auditoria só com projeto aberto; cliente não vê Dashboard', () => {
    const ids = (role: string, projectId: string | null = null) => navigationFor(role, { projectId }).map((item) => item.id);
    expect(ids('JGM4_ADMIN')).toEqual(expect.arrayContaining(['dashboard', 'projects', 'approvals', 'admin-companies', 'admin-users', 'admin-projects', 'admin-templates', 'admin-security']));
    expect(ids('JGM4_CONSULTANT')).toEqual(['dashboard', 'projects', 'approvals']);
    expect(ids('CLIENT_MANAGER')).toEqual(['projects', 'approvals']); expect(ids('CLIENT_USER').some((id) => id.startsWith('admin'))).toBe(false);
    expect(ids('CLIENT_SPONSOR', 'abc')).toEqual(['projects', 'approvals', 'proposal', 'reports', 'audit']); expect(ids('CLIENT_SPONSOR', null)).not.toContain('reports');
    expect(navigationFor(null)).toEqual([]);
    expect(navigationFor('JGM4_ADMIN', { projectId: 'p1' }).find((item) => item.id === 'reports')?.link).toBe('/projects/p1/reports');
  });
  it('erros amigáveis: explicam o que fazer e não vazam detalhe técnico', () => {
    expect(friendlyError(0, undefined, 'carregar o projeto')).toBe('Não foi possível carregar o projeto. Verifique sua conexão e tente novamente.');
    expect(friendlyError(500, 'Error: ECONNREFUSED stack at x', 'salvar')).not.toMatch(/ECONNREFUSED|stack/);
    expect(friendlyError(403, undefined)).toMatch(/permissão/); expect(friendlyError(404, undefined)).toMatch(/não foi encontrado/); expect(friendlyError(429, undefined)).toMatch(/Aguarde/);
    expect(friendlyError(409, 'Já existe um projeto com este nome.')).toBe('Já existe um projeto com este nome.');
  });
  it('formata datas, horas e percentuais no padrão pt-BR', () => {
    expect(fmtDate('2026-10-25')).toBe('25/10/2026'); expect(fmtDate('2026-10-25T00:00:00.000Z')).toBe('25/10/2026'); expect(fmtDate(null)).toBe('—'); expect(fmtDate('lixo')).toBe('—');
    expect(fmtDateTime(new Date(2026, 9, 25, 14, 30))).toBe('25/10/2026 14:30');
    expect(fmtHours(36)).toBe('36 h'); expect(fmtHours('36.00')).toBe('36 h'); expect(fmtHours(7.5)).toBe('7,5 h'); expect(fmtHours(null)).toBe('0 h');
    expect(fmtPercent(78)).toBe('78%'); expect(fmtPercent('78.0000')).toBe('78%'); expect(fmtPercent(77.6)).toBe('78%'); expect(fmtPercent(undefined)).toBe('0%');
    expect(initials('Maria Souza Lima')).toBe('ML'); expect(initials('  ')).toBe('?');
  });
});
