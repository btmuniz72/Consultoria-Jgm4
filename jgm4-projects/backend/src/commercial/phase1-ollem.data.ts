import type { ActionClassification, TaskPriority } from '../generated/prisma/client';

// Conteúdo da Fase 1 da Ollem (10B.1): exercícios operacionais EX-01..EX-11, frente "Controle de Fios e Cabos" e marcos M1..M4.
// Regra: reutilizar atividade existente quando o objetivo é o mesmo (EX-01/02 → C01; EX-03 → C12; EX-07 → C11).

export const CATEGORIES = {
  exercise: 'Exercício operacional',
  cables: 'Controle de Fios e Cabos',
  layout: 'Layout e Estruturas',
  addressing: 'Endereçamento',
  critical: 'Materiais Críticos',
  systems: 'Sistemas e Controles',
} as const;

export interface TaskMeta { category?: string; classification?: ActionClassification; priority?: TaskPriority; milestone?: string }

/** Atividades JÁ EXISTENTES na Fase 1: só recebem metadados quando o campo ainda está vazio (nunca sobrescreve edição manual). */
export const existingMeta: Record<string, TaskMeta> = {
  C01: { category: CATEGORIES.layout, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M1' },
  C02: { category: CATEGORIES.layout, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M3' },
  C03: { category: CATEGORIES.layout, classification: 'EXECUTE_NOW', priority: 'NORMAL' },
  C04: { category: CATEGORIES.layout, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M3' },
  C05: { category: CATEGORIES.layout, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M2' },
  C06: { category: CATEGORIES.layout, classification: 'PARALLEL', priority: 'NORMAL' },
  C10: { category: CATEGORIES.addressing, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M4' },
  C11: { category: CATEGORIES.addressing, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' },
  C12: { category: CATEGORIES.critical, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M2' },
  C30: { category: CATEGORIES.systems, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' },
  C31: { category: CATEGORIES.systems, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' },
  C32: { category: CATEGORIES.systems, classification: 'DEVELOPMENT', priority: 'HIGH', milestone: 'M4' },
  'OL-COMPRAS': { category: CATEGORIES.layout, classification: 'ACQUISITION', priority: 'NORMAL', milestone: 'M4' },
};

/** Exercícios absorvidos por atividades existentes: sufixo no título (rastreabilidade) + bloco de instruções + itens de checklist. */
export const absorbed: Array<{ code: string; titleSuffix: string; marker: string; instructions: string; checklist: string[] }> = [
  { code: 'C01', titleSuffix: ' (EX-01 · EX-02)', marker: 'EX-01',
    instructions: 'EX-01 — Validação da planta: a Ollem classifica cada área e estrutura como "Pode mudar", "Pode mudar com aprovação" ou "Não pode mudar", anexando evidências, fotos e comentários. EX-02 — Validação de medidas: levantar corredores, cabeceiras, portões, vãos, estruturas, áreas de giro, doca, área de miudezas, parede dos tubos e zona de cabos.',
    checklist: ['EX-01 · Classificar áreas e estruturas (pode mudar / pode mudar com aprovação / não pode mudar)', 'EX-01 · Anexar fotos e comentários que sustentem a classificação',
      'EX-02 · Medir corredores e cabeceiras', 'EX-02 · Medir portões e vãos', 'EX-02 · Medir estruturas e áreas de giro', 'EX-02 · Medir doca, área de miudezas, parede dos tubos e zona de cabos'] },
  { code: 'C12', titleSuffix: ' (EX-03)', marker: 'EX-03',
    instructions: 'EX-03 — Materiais críticos: a Ollem classifica os materiais em CR1, CR2 ou CR3 e registra a justificativa de cada classificação.',
    checklist: ['EX-03 · Classificar os materiais em CR1, CR2 ou CR3', 'EX-03 · Registrar a justificativa de cada classificação'] },
  { code: 'C11', titleSuffix: ' (EX-07)', marker: 'EX-07',
    instructions: 'EX-07 — Endereçamento: validar na área piloto a localização e a leitura dos endereços físicos definidos em C10 (C10 define o padrão; C11 valida na prática).',
    checklist: ['EX-07 · Conferir a localização física dos endereços da área piloto', 'EX-07 · Validar a leitura e a identificação dos endereços pelos operadores', 'EX-07 · Registrar divergências e ajustes ao padrão definido em C10'] },
];

export interface NewTask { code: string; title: string; objective: string; instructions: string; checklist: string[]; meta: Required<Pick<TaskMeta, 'category' | 'classification' | 'priority' | 'milestone'>> }
const evidence = 'Registrar evidências do resultado.';

/** As 12 atividades novas (sem equivalente na Fase 1). Não exigem o GATE-1 contratual (requiredForGate=false). */
export const newTasks: NewTask[] = [
  { code: 'EX-04', title: 'EX-04 — Família × armazenagem', objective: 'Definir o tipo de armazenagem de cada grupo de materiais.',
    instructions: 'Para cada grupo/família de materiais, definir a armazenagem: porta-paletes, estante, BIN, porta-bobinas, tubos verticais, piso, área controlada ou outro. É o insumo do zoneamento (C05).',
    checklist: ['Listar os grupos e famílias de materiais', 'Definir a armazenagem de cada grupo (porta-paletes, estante, BIN, porta-bobinas, tubos verticais, piso, área controlada, outro)', 'Justificar as exceções', evidence],
    meta: { category: CATEGORIES.layout, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M2' } },
  { code: 'EX-05', title: 'EX-05 — Miudezas', objective: 'Levantar as miudezas do almoxarifado.',
    instructions: 'Levantar, por item de miudezas: família, SKU, giro, valor, necessidade de confinamento e tipo de armazenagem. Anexar a planilha preenchida.',
    checklist: ['Levantar família e SKU das miudezas', 'Informar giro e valor', 'Indicar a necessidade de confinamento', 'Definir o tipo de armazenagem', evidence],
    meta: { category: CATEGORIES.exercise, classification: 'EXECUTE_NOW', priority: 'NORMAL', milestone: 'M2' } },
  { code: 'EX-06', title: 'EX-06 — Tubos galvanizados', objective: 'Levantar os tubos galvanizados.',
    instructions: 'Levantar tipo, bitola, comprimento, peso, estoque médio, estoque máximo e forma de movimentação dos tubos galvanizados. Anexar a planilha preenchida.',
    checklist: ['Levantar tipo, bitola e comprimento', 'Informar peso', 'Informar estoque médio e estoque máximo', 'Descrever a forma de movimentação', evidence],
    meta: { category: CATEGORIES.exercise, classification: 'EXECUTE_NOW', priority: 'NORMAL', milestone: 'M2' } },
  { code: 'EX-08', title: 'EX-08 — Recebimento', objective: 'Simular o recebimento de material com pendência sistêmica.',
    instructions: 'Simular o recebimento de um material com pendência sistêmica, registrando o fluxo físico, o tratamento da pendência e os pontos de falha encontrados.',
    checklist: ['Simular o recebimento com pendência sistêmica', 'Registrar o fluxo físico e o tratamento da pendência', 'Listar os pontos de falha e necessidades de sistema', evidence],
    meta: { category: CATEGORIES.exercise, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' } },
  { code: 'EX-09', title: 'EX-09 — Devolução', objective: 'Simular o retorno de material.',
    instructions: 'Simular o retorno de material ao almoxarifado, registrando fluxo, área de quarentena e decisão sobre o item. Os cabos têm tratamento próprio em CAB-04. O processo definitivo é tratado em C23 (Fase 2).',
    checklist: ['Simular o retorno de material', 'Registrar o fluxo e a área de quarentena', 'Registrar a decisão sobre o item devolvido', evidence],
    meta: { category: CATEGORIES.exercise, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' } },
  { code: 'EX-10', title: 'EX-10 — Transferência Matriz/Filial', objective: 'Validar o fluxo físico, sistêmico e fiscal da transferência.',
    instructions: 'Validar o fluxo de transferência entre Matriz e Filial nos três planos: físico, sistêmico e fiscal. Registrar responsáveis, documentos e pontos de falha.',
    checklist: ['Descrever o fluxo físico da transferência', 'Descrever o fluxo sistêmico', 'Descrever o fluxo fiscal e os documentos', 'Listar pontos de falha e responsáveis', evidence],
    meta: { category: CATEGORIES.exercise, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' } },
  { code: 'EX-11', title: 'EX-11 — Veículos como depósitos', objective: 'Inventariar o veículo e comparar com o sistema.',
    instructions: 'Inventariar o veículo usado como depósito e comparar o conteúdo com o saldo do sistema, registrando as divergências. A padronização da rotina de veículos é tratada em C22 (Fase 2); cabos em veículo seguem CAB-03.',
    checklist: ['Inventariar o conteúdo do veículo', 'Comparar com o saldo do sistema', 'Registrar as divergências encontradas', evidence],
    meta: { category: CATEGORIES.exercise, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' } },
  { code: 'CAB-01', title: 'CAB-01 — Levantamento dos cabos', objective: 'Levantar os fios e cabos existentes.',
    instructions: 'Levantar os fios e cabos do almoxarifado, veículos e obras: tipo, bitola e quantidade. Anexar a planilha e fotos.',
    checklist: ['Levantar tipos e bitolas de fios e cabos', 'Levantar as quantidades', evidence],
    meta: { category: CATEGORIES.cables, classification: 'EXECUTE_NOW', priority: 'HIGH', milestone: 'M2' } },
  { code: 'CAB-02', title: 'CAB-02 — Dimensões, pesos e metragens', objective: 'Registrar dimensões, pesos e metragens dos cabos.',
    instructions: 'Registrar dimensões das bobinas e rolos, pesos e metragens de fios e cabos.',
    checklist: ['Registrar dimensões das bobinas e rolos', 'Registrar pesos', 'Registrar metragens', evidence],
    meta: { category: CATEGORIES.cables, classification: 'EXECUTE_NOW', priority: 'NORMAL', milestone: 'M2' } },
  { code: 'CAB-03', title: 'CAB-03 — Localização: almoxarifado / veículo / obra', objective: 'Registrar onde cada cabo está.',
    instructions: 'Registrar a localização dos fios e cabos: almoxarifado, veículo ou obra, com o responsável por cada local.',
    checklist: ['Registrar o que está no almoxarifado', 'Registrar o que está em veículos', 'Registrar o que está em obras', evidence],
    meta: { category: CATEGORIES.cables, classification: 'EXECUTE_NOW', priority: 'NORMAL', milestone: 'M2' } },
  { code: 'CAB-04', title: 'CAB-04 — Devolução de cabos', objective: 'Definir o tratamento da devolução de cabos.',
    instructions: 'Simular e definir o retorno de sobras de cabos de obra ou veículo ao almoxarifado: conferência de metragem, registro e destino da sobra.',
    checklist: ['Simular a devolução de sobra de cabo', 'Registrar a conferência de metragem', 'Definir o destino da sobra', evidence],
    meta: { category: CATEGORIES.cables, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' } },
  { code: 'CAB-05', title: 'CAB-05 — Metragem mínima reaproveitável', objective: 'Definir a metragem mínima reaproveitável de cada cabo.',
    instructions: 'Definir, por tipo de cabo, a metragem mínima a partir da qual a sobra é reaproveitável, e a forma de controle (por exemplo, contador de metragem).',
    checklist: ['Definir a metragem mínima reaproveitável por tipo de cabo', 'Definir a forma de controle da metragem', evidence],
    meta: { category: CATEGORIES.cables, classification: 'PARALLEL', priority: 'NORMAL', milestone: 'M4' } },
];

export interface MilestoneSpec { code: string; title: string; question: string; criteria: string[] }
/** Marcos internos da Fase 1 — independentes dos Gates contratuais. Datas previstas ficam em branco (a JGM4 define). */
export const milestones: MilestoneSpec[] = [
  { code: 'M1', title: 'Planta validada', question: 'A planta, as restrições e as medidas críticas estão confirmadas?', criteria: ['Planta confirmada', 'Restrições levantadas', 'Medidas críticas validadas'] },
  { code: 'M2', title: 'Zoneamento aprovado', question: 'As áreas estão definidas e as famílias, cabos, miudezas e tubos posicionados?', criteria: ['Áreas definidas', 'Famílias alocadas', 'Cabos, miudezas e tubos posicionados'] },
  { code: 'M3', title: 'Layout aprovado', question: 'O layout, as estruturas e a circulação foram validados pela Ollem?', criteria: ['Layout validado pela Ollem', 'Estruturas aceitas', 'Corredores e manobras aprovados'] },
  { code: 'M4', title: 'Implantação preparada', question: 'Endereçamento, requisitos de sistema, materiais e cronograma estão prontos para implantar?', criteria: ['Endereçamento definido', 'Requisitos de sistema definidos', 'Materiais e equipamentos necessários listados', 'Responsáveis e cronograma aprovados'] },
];

/** Predecessoras acrescentadas a atividades existentes (só se ainda não houver predecessora). */
export const predecessors: Record<string, string> = { C05: 'EX-04' };
