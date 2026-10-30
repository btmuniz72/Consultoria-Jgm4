export const HO_RATE = 120;
export const IC_RATE = 220;
export const acknowledgements = ['Li o escopo.', 'Compreendi as responsabilidades.', 'Estou de acordo com a estrutura de fases.', 'Estou de acordo com horas e valores.', 'Estou ciente das premissas e condições de interrupção.'];
export const parallelStages = ['Definição técnica', 'Orçamento', 'Aprovação Ollem', 'Compra/contratação', 'Prazo fornecedor', 'Recebimento', 'Instalação', 'Validação'];
export const terms = {
  objective: 'Estruturar o CD da Ollem física e sistemicamente para uma operação padronizada e sustentável.',
  methodology: 'Implantação assistida: a JGM4 planeja, orienta, documenta, acompanha e valida. A Ollem executa e fornece informações e evidências.',
  platform: 'O JGM4 Projects concentra solicitações, atividades, evidências, responsáveis, reuniões, aprovações e Gates com histórico auditável.',
  jgm4: 'Metodologia, planejamento, análise, layout, processos, orientação, documentação, acompanhamento, reuniões, inventários assistidos, treinamentos e Gates.',
  client: 'Execução física, informações, movimentação de estoque após aceite, compras e contratações, alterações no sistema pelo fornecedor, cadastro, inventários e implantação das orientações aprovadas.',
  payment: 'Cada fase poderá possuir entrada própria antes do início. Cobrança somente sobre horas JGM4 contratadas. Horas da Ollem não geram valor.',
  assumptions: 'Datas exatas configuráveis; planta ou croqui com medidas confiáveis fornecido pela Ollem; responsáveis e acessos definidos; disponibilidade da equipe e informações; EAN-13 somente quando aplicável ao produto e DUN-14 quando houver embalagem logística aplicável.',
  exclusions: 'Execução física, compra de estruturas/equipamentos, desenvolvimento no ERP e horas internas de preparação da JGM4 não integram as horas comerciais. Contrato é documento separado; a validação da proposta não é assinatura contratual.',
  interruption: 'O projeto poderá ser interrompido por qualquer uma das partes mediante comunicação formal. Permanecem devidos os serviços efetivamente executados até a data da interrupção e despesas previamente aprovadas.',
  restart: 'Em eventual retomada, cronograma, pendências e dimensionamento poderão ser revistos.',
  external: 'Dependência física em andamento — projeto continua nas atividades independentes.',
};
export const ollemPhases = [
  { name: 'Preparação do projeto', period: 'Preparação — sem cobrança', start: null, end: null, weeks: 0,
    description: 'Empresa e projeto, usuários e acessos, patrocinador, gestor, responsáveis, apresentação do Projects, solicitações, atividades, evidências, Gates, reuniões, informações iniciais e documentos.',
    question: 'A estrutura administrativa, os responsáveis e as informações iniciais estão suficientes para iniciar a implantação técnica?',
    criteria: ['Patrocinador definido', 'Gestor definido', 'Usuários definidos', 'Acessos configurados', 'Rotina de reuniões definida', 'Informações iniciais solicitadas', 'Projeto apresentado à Ollem'] },
  { name: 'Estruturação do CD', period: '04/11/2026 a 31/01/2027', start: '2026-11-04', end: '2027-01-31', weeks: 13,
    description: 'Planta/croqui, layout, estruturas, compras paralelas, organização física, movimentações aprovadas, endereçamento, criticidade, cadastros e campos sistêmicos. Exercícios operacionais da Fase 1, frente de Controle de Fios e Cabos e marcos internos M1 a M4. Orientações pontuais; treinamentos operacionais formais na Fase 2.',
    question: 'O CD está suficientemente estruturado física e sistemicamente para iniciar inventário, validação e treinamento?',
    criteria: ['Layout aprovado', 'Zonas definidas', 'Endereçamento definido', 'Movimentações essenciais realizadas', 'Plano das movimentações pendentes definido', 'Compras/contratações críticas controladas', 'Campo de endereço disponível', 'Campo de criticidade disponível', 'Campo EAN disponível quando aplicável', 'Campo DUN disponível quando aplicável', 'Criticidade iniciada', 'Estrutura física mínima disponível; compras de longo prazo não impeditivas podem continuar'] },
  { name: 'Inventário, processos e treinamentos', period: 'Fevereiro e março de 2027', start: '2027-02-01', end: '2027-03-31', weeks: 9,
    description: 'Inventário assistido, físico x sistema, endereços e criticidade, divergências, treinamentos presenciais, separação, documentos, picking, abastecimento e mínimos/máximos.',
    question: 'A equipe e a operação estão aptas a trabalhar com o novo modelo?',
    criteria: ['Inventário executado', 'Divergências críticas tratadas', 'Endereçamento validado', 'Equipe treinada', 'Separação definida', 'Documentos definidos', 'Picking definido', 'Abastecimento definido', 'Mínimos/máximos definidos ou metodologia aprovada'] },
  { name: 'Estabilização e sustentação', period: 'Após validação da Fase 2 — datas a definir', start: null, end: null, weeks: 0,
    description: 'Revisão dos processos e rotinas, auditorias, indicadores, POPs finais, inventário cíclico por criticidade, correções, plano de sustentação e fechamento.',
    question: 'A Ollem consegue manter o modelo implantado com autonomia?',
    criteria: ['Endereçamento e cadastro mantidos', 'Organização preservada', 'Inventário cíclico definido: CR1 maior frequência, CR2 intermediária, CR3 menor', 'Separação, picking e abastecimento sustentáveis', 'Controles e responsabilidades definidos', 'Aderência físico x sistema validada', 'POPs finais e plano de sustentação entregues'] },
] as const;
export function commercialAmounts(order: number, ho: number | null, ic: number | null, entryPercent = 100, organization = 'JGM4') {
  const configured = order === 0 || organization !== 'JGM4' || ho !== null && ic !== null;
  const total = order === 0 || organization !== 'JGM4' ? 0 : configured ? Math.round((ho! * HO_RATE + ic! * IC_RATE) * 100) / 100 : null;
  const entry = total === null ? null : Math.round(total * entryPercent) / 100;
  return { configured, total, entry, balance: total === null ? null : Math.round((total - entry!) * 100) / 100 };
}
