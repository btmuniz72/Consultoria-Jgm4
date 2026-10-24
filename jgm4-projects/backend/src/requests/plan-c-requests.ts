import { Prisma } from '../generated/prisma/client';

export const planCRequests = [
  { code: 'SOL-001', phase: 0, title: 'Indicar patrocinador do projeto', blocking: true,
    description: 'Identificar quem possui autoridade para decisões críticas e confirmação dos Gates pela Ollem.',
    instructions: 'Informar nome, cargo e autoridade do patrocinador; confirmar sua participação nas decisões de Gate.',
    acceptanceCriteria: 'Patrocinador identificado e autoridade de decisão confirmada.', requirements: ['Nome e cargo do patrocinador', 'Autoridade para decisões e Gates confirmada'] },
  { code: 'SOL-002', phase: 0, title: 'Indicar responsáveis internos', blocking: true,
    description: 'Identificar o gestor operacional e os responsáveis internos pela execução do Plano C.',
    instructions: 'Relacionar nome, cargo, responsabilidade e disponibilidade semanal de cada participante.',
    acceptanceCriteria: 'Gestor e responsáveis internos identificados, com disponibilidade informada.', requirements: ['Gestor operacional identificado', 'Responsáveis internos e disponibilidade informados'] },
  { code: 'SOL-003', phase: 0, title: 'Consolidar croqui e medidas gerais', blocking: false,
    description: 'Consolidar a representação física e as medidas gerais do almoxarifado.',
    instructions: 'Reunir croqui, medidas, acessos e restrições físicas; conferir a consistência das informações.',
    acceptanceCriteria: 'Croqui consolidado e medidas gerais suficientes para análise.', requirements: ['Croqui consolidado', 'Medidas gerais conferidas'] },
  { code: 'SOL-004', phase: 0, title: 'Disponibilizar cadastro de materiais', blocking: false,
    description: 'Disponibilizar o cadastro utilizado pela Ollem como base de análise dos materiais.',
    instructions: 'Consolidar o cadastro disponível; informar fonte, responsável e limitações conhecidas.',
    acceptanceCriteria: 'Cadastro disponível, com fonte oficial e limitações identificadas.', requirements: ['Cadastro de materiais disponibilizado', 'Fonte e limitações informadas'] },
  { code: 'SOL-005', phase: 0, title: 'Informar fluxos entre sistemas e responsáveis', blocking: false,
    description: 'Descrever os fluxos de informação e os responsáveis pelos controles atuais.',
    instructions: 'Relacionar sistemas e controles utilizados; indicar responsáveis e passagens de informação.',
    acceptanceCriteria: 'Fluxos, fontes de informação e responsáveis identificados.', requirements: ['Fluxos e sistemas descritos', 'Responsáveis pelos controles identificados'] },
  { code: 'SOL-006', phase: 0, title: 'Levantamento dimensional do Depósito 01', blocking: true,
    description: 'Consolidar as dimensões do Depósito 01 necessárias à definição do zoneamento operacional.',
    instructions: 'Medir comprimento e largura; identificar corredores, pilares, acessos e estruturas existentes; consolidar o croqui e registrar as informações na resposta.',
    acceptanceCriteria: 'Os seis requisitos estão completos e as informações são suficientes para validar o zoneamento.',
    requirements: ['Comprimento e largura', 'Corredores', 'Pilares', 'Acessos', 'Estruturas existentes', 'Croqui consolidado'] },
  { code: 'SOL-007', phase: 1, title: 'Apresentar resultados do inventário cíclico piloto', blocking: false,
    description: 'Disponibilizar contagens do piloto e investigação das divergências.',
    instructions: 'Consolidar contagens, endereços utilizados e análise das divergências.',
    acceptanceCriteria: 'Inventário piloto registrado e divergências investigadas.', requirements: ['Contagens e endereços registrados', 'Divergências investigadas'] },
  { code: 'SOL-008', phase: 2, title: 'Apresentar registros de aplicação dos POPs', blocking: false,
    description: 'Demonstrar o uso dos processos prioritários padronizados.',
    instructions: 'Relacionar POPs treinados, registros de aplicação e desvios tratados.',
    acceptanceCriteria: 'POPs prioritários treinados e utilizados na rotina.', requirements: ['Treinamentos registrados', 'Aplicação dos POPs e desvios registrados'] },
  { code: 'SOL-009', phase: 3, title: 'Confirmar fontes oficiais e responsáveis pelos indicadores', blocking: false,
    description: 'Consolidar as fontes e responsabilidades da governança operacional.',
    instructions: 'Indicar fontes oficiais, responsáveis, indicadores em uso e pendências com dono e prazo.',
    acceptanceCriteria: 'Fontes e responsáveis formalizados, com indicadores em uso.', requirements: ['Fontes oficiais e responsáveis definidos', 'Indicadores e pendências registrados'] },
  { code: 'SOL-010', phase: 4, title: 'Consolidar plano de sustentação e pendências residuais', blocking: false,
    description: 'Registrar como a Ollem sustentará o modelo implantado com autonomia.',
    instructions: 'Consolidar responsáveis, rotinas de sustentação e pendências residuais.',
    acceptanceCriteria: 'Plano de sustentação definido e pendências residuais registradas.', requirements: ['Plano de sustentação definido', 'Pendências residuais com responsáveis'] },
] as const;

// Ponto único para o seed e para a futura criação de projetos pelo template.
// Deve ser chamado na mesma transação que cria o projeto e suas fases.
export async function ensurePlanCRequests(tx: Prisma.TransactionClient, projectId: string, createdByUserId: string | null = null) {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, include: { phases: true } });
  if (project.methodology !== 'PLANO_C') throw new Error('Template de solicitações restrito ao PLANO_C.');
  const zoneTask = await tx.task.findFirst({ where: { projectId, code: { in: ['C05', 'F0-002'] } }, orderBy: { code: 'asc' } });
  for (const definition of planCRequests) {
    const phase = project.phases.find((item) => item.order === definition.phase);
    if (!phase) throw new Error(`Fase ${definition.phase} ausente no projeto.`);
    const existing = await tx.projectRequest.findUnique({ where: { projectId_code: { projectId, code: definition.code } } });
    if (existing) continue;
    if (definition.code === 'SOL-006' && !zoneTask) throw new Error('Atividade C05 de zoneamento ausente.');
    const request = await tx.projectRequest.create({ data: {
      projectId, phaseId: phase.id, code: definition.code, title: definition.title,
      description: definition.description, instructions: definition.instructions,
      acceptanceCriteria: definition.acceptanceCriteria, blocking: definition.blocking,
      mandatory: true, status: definition.phase === 0 ? 'AVAILABLE' : 'BLOCKED', createdByUserId,
      taskId: definition.code === 'SOL-006' ? zoneTask!.id : null,
      requirements: { create: definition.requirements.map((label, order) => ({ label, order, required: true })) },
    } });
    await tx.auditLog.create({ data: {
      projectId, entityType: 'ProjectRequest', entityId: request.id, action: 'CREATED',
      userId: createdByUserId, actorType: createdByUserId ? 'USER' : 'SYSTEM',
      newValue: { code: request.code, status: request.status, template: 'PLANO_C' },
    } });
  }
}
