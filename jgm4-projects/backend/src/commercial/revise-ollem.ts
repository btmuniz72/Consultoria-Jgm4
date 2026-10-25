import { Prisma, PrismaClient } from '../generated/prisma/client';
import { ollemPhases } from './ollem-plan';
import { lockCommercialProject } from './commercial-guard';

// Reexecução segura: não substitui configurações ou decisões após a revisão 1.
export async function reviseOllem(prisma: PrismaClient, projectId: string) {
  return prisma.$transaction(async tx => {
    await lockCommercialProject(tx, projectId);
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    if (project.ollemRevision >= 1) return { revised: false };
    const log = (type: string, id: string, oldValue: unknown, newValue: unknown) => tx.auditLog.create({ data: { projectId, entityType: type, entityId: id, action: 'OLLEM_PLAN_REVISED', actorType: 'SYSTEM', oldValue: JSON.parse(JSON.stringify(oldValue)), newValue: JSON.parse(JSON.stringify(newValue)) } });
    const oldPhases = await tx.phase.findMany({ where: { projectId }, include: { gate: { include: { criteria: true } } }, orderBy: { order: 'asc' } });
    const phases: string[] = []; const gates: string[] = [];
    for (const [order, spec] of ollemPhases.entries()) {
      const previous = oldPhases.find(p => p.order === order);
      const data = { name: spec.name, description: spec.description, plannedWeeks: spec.weeks, plannedJgm4Hours: 0, archived: false, plannedStartDate: spec.start ? new Date(spec.start) : null, plannedEndDate: spec.end ? new Date(spec.end) : null };
      const p = previous ? await tx.phase.update({ where: { id: previous.id }, data }) : await tx.phase.create({ data: { ...data, order, projectId, status: order === 0 ? 'AVAILABLE' : 'LOCKED' } });
      phases.push(p.id);
      await log('Phase', p.id, previous ?? null, p);
      await tx.phaseCommercial.create({ data: { phaseId: p.id, ...(order === 0 ? { homeOfficeHours: 0, inCompanyHours: 0 } : {}) } });
      const oldGate = previous?.gate;
      const gateData = { title: order === 3 ? 'Gate final — Autonomia operacional' : spec.name, question: spec.question };
      const gate = oldGate ? await tx.gate.update({ where: { id: oldGate.id }, data: gateData }) : await tx.gate.create({ data: { ...gateData, projectId, phaseId: p.id, code: `GATE-${order}` } });
      gates.push(gate.id);
      // Critérios anteriores ficam consultáveis em auditoria e no banco, com as evidências originais.
      await tx.gateCriterion.updateMany({ where: { gateId: gate.id }, data: { archived: true } });
      for (const [index, description] of spec.criteria.entries()) await tx.gateCriterion.create({ data: { gateId: gate.id, code: `OL-${order}-${index + 1}`, order: index + 1, description, mandatory: true, evidenceRequired: true, sourceType: 'MANUAL' } });
      await log('Gate', gate.id, oldGate ?? null, { ...gate, criteria: spec.criteria });
    }
    for (const p of oldPhases.filter(p => p.order > 3)) {
      await tx.phase.update({ where: { id: p.id }, data: { archived: true } });
      await log('Phase', p.id, p, { archived: true, reason: 'Estrutura anterior preservada para consulta histórica.' });
    }
    const phaseFor: Record<string, number> = { C00: 0, G0: 0, C01: 1, C02: 1, C03: 1, C04: 1, C05: 1, C06: 1, C10: 1, C11: 1, C12: 1, G1: 1, C13: 2, C14: 2, C20: 2, C21: 2, C22: 2, C23: 2, C24: 2, C25: 2, G2: 2, C30: 1, C31: 1, C32: 1, C33: 3, C34: 3, G3: 3, C40: 2, C41: 2, C42: 3, C43: 3, C44: 3 };
    const instructions: Record<string, string> = {
      C00: 'Cadastrar empresa, projeto e usuários; definir patrocinador, gestor e responsáveis; configurar acessos, apresentar Projects, solicitações, atividades, evidências e Gates; definir reuniões e solicitar informações e documentos iniciais. Sem cobrança.',
      C01: 'Ollem fornece planta existente ou croqui com medidas confiáveis, acessos, corredores, estruturas, áreas ocupadas, equipamentos, obstáculos, circulação e fotos permitidas. JGM4 analisa remotamente sempre que possível.',
      C02: 'Propor recebimento, armazenagem, ferramentas, EPIs, miudezas, pesados, quarentena, devoluções, descarte, separação, expedição, críticos, circulação e apoio. Avaliar verticalização, estantes, porta-paletes, caixas, identificação, segurança, espaço e fluxo.',
      C04: 'JGM4 propõe → Ollem analisa → aceite registrado → movimentação Ollem → evidência → validação JGM4. Movimentações estruturais relevantes exigem aceite prévio.',
      C10: 'Depósito → Rua → Andar → Apartamento; padrão simples e escalável, exemplo 01-03-02-05. JGM4 define formato e preenchimento; Ollem ou fornecedor cria campo no sistema.',
      C12: 'Ollem classifica CR1 (alta: falta, valor, prazo de reposição ou parada), CR2 (média) e CR3 (baixa). JGM4 orienta a metodologia. Ollem disponibiliza campo próprio no cadastro.',
      C14: 'Treinamento presencial em janeiro: endereçamento, recebimento, armazenagem, movimentação, separação, devolução, inventário, criticidade, controles e campos sistêmicos.',
      C21: 'Solicitação → liberação → separação → conferência → entrega/expedição → baixa. Definir área para separados, aguardando retirada e conferência sem mistura com estoque disponível.',
      C32: 'Cadastro mínimo: descrição, código interno, endereço, criticidade CR1/CR2/CR3, unidade e demais campos necessários. Ollem cria/valida campos EAN-13 e DUN-14; JGM4 orienta finalidade e preenchimento. Não exigir EAN quando não aplicável nem DUN sem embalagem logística.',
      C40: 'Inventário de validação assistido: físico x sistema, endereços, divergências, criticidade, cadastro e organização. Execução conjunta em janeiro.',
      C41: 'Registrar divergência, analisar causa, corrigir cadastro e endereço; corrigir saldo somente quando autorizado e registrar ação.',
      C44: 'Plano de sustentação e inventário cíclico simples: CR1 maior frequência, CR2 intermediária, CR3 menor. Revisar POPs, indicadores e responsáveis.',
    };
    const titles: Record<string, string> = { C00: 'Preparação administrativa e apresentação do projeto', C02: 'Layout e melhorias físicas', C04: 'Movimentações estruturais aprovadas', C06: 'Orientações pontuais para implantação', C13: 'Inventário inicial e validação', C14: 'Treinamentos presenciais — janeiro de 2027', C32: 'Cadastro, campos de endereço, criticidade, EAN-13 e DUN-14', G3: 'Preparação e análise do Gate final' };
    const tasks = await tx.task.findMany({ where: { projectId } });
    for (const task of tasks) {
      const order = phaseFor[task.code]; if (order === undefined) continue;
      const data: Prisma.TaskUncheckedUpdateInput = { phaseId: phases[order], blockedByGateId: order ? gates[order - 1] : null, predecessorTaskId: null,
        ...(titles[task.code] ? { title: titles[task.code] } : {}), ...(instructions[task.code] ? { instructions: instructions[task.code], objective: titles[task.code] ?? task.title } : {}),
        ...(order === 0 ? { plannedJgm4Hours: 0 } : {}), ...(task.code === 'C04' ? { movementApprovalRequired: true } : {}),
        plannedStartDate: ollemPhases[order].start ? new Date(ollemPhases[order].start!) : null, plannedEndDate: ollemPhases[order].end ? new Date(ollemPhases[order].end!) : null,
      };
      // Mudança de phaseId propaga às evidências, horas e solicitações pelo ON UPDATE CASCADE existente.
      const updated = await tx.task.update({ where: { id: task.id }, data });
      await log('Task', task.id, task, updated);
    }
    // Solicitações sem atividade seguem o conteúdo: preparação administrativa ou informação técnica.
    for (const request of await tx.projectRequest.findMany({ where: { projectId, taskId: null } })) {
      const administrative = /responsáve|patrocinador|gestor|usuário|acesso|reunião/i.test(request.title);
      const phaseId = phases[administrative ? 0 : 1];
      if (phaseId !== request.phaseId) { await tx.projectRequest.update({ where: { id: request.id }, data: { phaseId } }); await log('ProjectRequest', request.id, request, { phaseId }); }
    }
    const additions = [
      { code: 'OL-PICK', phase: 2, title: 'Picking e abastecimento', instructions: 'Separar reserva e picking; definir posições dos itens de maior giro. Nível de reposição → necessidade → retirada da reserva → abastecimento → registro atualizado.' },
      { code: 'OL-MINMAX', phase: 2, title: 'Estoque mínimo e máximo', instructions: 'Mínimo: consumo, prazo de reposição, criticidade, disponibilidade e necessidade operacional. Máximo: espaço, consumo, lote, frequência de compra, excesso e obsolescência.' },
      { code: 'OL-DOC', phase: 2, title: 'Documentos e registros operacionais', instructions: 'Priorizar sistema existente para solicitação, requisição, separação, conferência, transferência, devolução, consumo e entrega.' },
      { code: 'OL-COMPRAS', phase: 1, title: 'Compras e contratações em paralelo', instructions: 'Definição técnica → orçamento → aprovação Ollem → compra/contratação → prazo fornecedor → recebimento → instalação → validação. Estantes, estruturas, porta-paletes, caixas, identificação, movimentação e instalação. Continuar endereçamento, criticidade, cadastro, EAN/DUN, processos e sistema durante a espera.' },
    ];
    for (const task of additions) {
      const created = await tx.task.create({ data: { projectId, phaseId: phases[task.phase], code: task.code, title: task.title, objective: task.title, instructions: task.instructions, acceptanceCriteria: 'Resultado documentado e validado pela JGM4.', blockedByGateId: gates[task.phase - 1], requiredForGate: task.code !== 'OL-COMPRAS', status: 'BLOCKED', responsibilityType: 'JOINT' } });
      await log('Task', created.id, null, created);
    }
    await tx.project.update({ where: { id: projectId }, data: { ollemRevision: 1, commercialControlEnabled: true, plannedStartDate: new Date('2026-11-01') } });
    await log('Project', projectId, project, { ollemRevision: 1, commercialControlEnabled: true, plannedStartDate: '2026-11-01', commercialHours: 'A configurar pela JGM4_ADMIN' });
    return { revised: true };
  }, { timeout: 60000 });
}
