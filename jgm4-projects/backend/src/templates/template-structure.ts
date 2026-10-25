import { BadRequestException } from '@nestjs/common';

// Estrutura e validação de templates (funções puras, sem acesso ao banco).
export interface TemplateTree {
  phases: { id: string; order: number; name: string; plannedJgm4Hours: number }[];
  tasks: { id: string; code: string; phaseId: string; plannedJgm4Hours: unknown; plannedClientHours: unknown; checklist: { label: string }[] }[];
  gates: { id: string; code: string; phaseId: string; criteria: { code: string }[] }[];
  requests: { id: string; code: string; phaseId: string; requirements: { label: string }[]; relativeDueDays: number | null }[];
  dependencies: { kind: string; fromCode: string; toCode: string }[];
}
const num = (value: unknown) => Number(value ?? 0);

/** Erros impedem a ativação; avisos apenas informam. */
export function validateTemplateTree(tree: TemplateTree): { errors: string[]; warnings: string[] } {
  const errors: string[] = []; const warnings: string[] = [];
  const phases = [...tree.phases].sort((a, b) => a.order - b.order);
  if (!phases.length) errors.push('O template não possui fases.');
  phases.forEach((phase, index) => { if (phase.order !== index) errors.push(`A sequência das fases deve ser contínua a partir de 0 (esperado ${index}, encontrado ${phase.order} em "${phase.name}").`); });
  const phaseOrder = new Map(tree.phases.map((phase) => [phase.id, phase.order]));
  const dup = (label: string, codes: string[]) => { const seen = new Set<string>(); for (const code of codes) { if (seen.has(code)) errors.push(`${label} duplicado: ${code}.`); seen.add(code); } };
  dup('Código de atividade', tree.tasks.map((t) => t.code)); dup('Código de solicitação', tree.requests.map((r) => r.code)); dup('Código de Gate', tree.gates.map((g) => g.code));
  for (const task of tree.tasks) {
    if (!phaseOrder.has(task.phaseId)) errors.push(`A atividade ${task.code} não pertence a uma fase do template.`);
    if (num(task.plannedJgm4Hours) < 0 || num(task.plannedClientHours) < 0) errors.push(`A atividade ${task.code} possui horas negativas.`);
    if (!task.checklist.length) warnings.push(`A atividade ${task.code} não possui checklist.`);
  }
  for (const phase of phases) if (phase.plannedJgm4Hours < 0) errors.push(`A fase "${phase.name}" possui horas negativas.`);
  for (const request of tree.requests) {
    if (!phaseOrder.has(request.phaseId)) errors.push(`A solicitação ${request.code} não pertence a uma fase do template.`);
    if (request.relativeDueDays !== null && request.relativeDueDays < 0) errors.push(`A solicitação ${request.code} possui prazo relativo negativo.`);
    if (!request.requirements.length) warnings.push(`A solicitação ${request.code} não possui requisitos.`);
  }
  const taskByCode = new Map(tree.tasks.map((t) => [t.code, t])); const gateByCode = new Map(tree.gates.map((g) => [g.code, g])); const requestByCode = new Map(tree.requests.map((r) => [r.code, r]));
  const edges = new Map<string, string[]>();
  for (const dependency of tree.dependencies) {
    if (dependency.kind === 'TASK_AFTER_TASK') {
      const from = taskByCode.get(dependency.fromCode); const to = taskByCode.get(dependency.toCode);
      if (!from || !to) { errors.push(`Dependência inválida: ${dependency.fromCode} → ${dependency.toCode} (atividade inexistente).`); continue; }
      if (from.code === to.code) errors.push(`A atividade ${from.code} não pode depender de si mesma.`);
      edges.set(from.code, [...(edges.get(from.code) ?? []), to.code]);
    } else if (dependency.kind === 'TASK_BLOCKED_BY_GATE') {
      const from = taskByCode.get(dependency.fromCode); const gate = gateByCode.get(dependency.toCode);
      if (!from || !gate) { errors.push(`Dependência inválida: ${dependency.fromCode} → ${dependency.toCode} (atividade ou Gate inexistente).`); continue; }
      if ((phaseOrder.get(gate.phaseId) ?? 0) >= (phaseOrder.get(from.phaseId) ?? 0)) errors.push(`A atividade ${from.code} deve ser bloqueada por um Gate de fase anterior (${gate.code} não é).`);
    } else if (dependency.kind === 'REQUEST_FOR_TASK') {
      const request = requestByCode.get(dependency.fromCode); const task = taskByCode.get(dependency.toCode);
      if (!request || !task) { errors.push(`Dependência inválida: ${dependency.fromCode} → ${dependency.toCode} (solicitação ou atividade inexistente).`); continue; }
      if (request.phaseId !== task.phaseId) errors.push(`A solicitação ${request.code} e a atividade ${task.code} devem estar na mesma fase.`);
    }
  }
  // Ciclo na cadeia de predecessoras (DFS com cores).
  const state = new Map<string, number>();
  const visit = (code: string, path: string[]): boolean => {
    if (state.get(code) === 1) { errors.push(`Dependência circular entre atividades: ${[...path.slice(path.indexOf(code)), code].join(' → ')}.`); return true; }
    if (state.get(code) === 2) return false;
    state.set(code, 1);
    for (const next of edges.get(code) ?? []) if (visit(next, [...path, code])) return true;
    state.set(code, 2); return false;
  };
  for (const code of edges.keys()) if (visit(code, [])) break;
  for (const task of tree.tasks) { const preds = tree.dependencies.filter((d) => d.kind === 'TASK_AFTER_TASK' && d.fromCode === task.code); if (preds.length > 1) errors.push(`A atividade ${task.code} possui mais de uma predecessora (somente uma é suportada).`); }
  for (const phase of phases) {
    const gate = tree.gates.find((g) => g.phaseId === phase.id);
    if (!gate) warnings.push(`A fase "${phase.name}" não possui Gate.`); else if (!gate.criteria.length) warnings.push(`O Gate ${gate.code} não possui critérios.`);
    const sum = tree.tasks.filter((t) => t.phaseId === phase.id).reduce((total, t) => total + num(t.plannedJgm4Hours), 0);
    if (sum !== phase.plannedJgm4Hours) warnings.push(`Fase "${phase.name}": horas JGM4 da fase (${phase.plannedJgm4Hours}) diferem da soma das atividades (${sum}).`);
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------- campos editáveis por tipo (lista branca)
type FieldType = 'string' | 'text' | 'int' | 'number' | 'bool' | 'enum' | 'uuid';
export interface FieldSpec { type: FieldType; required?: boolean; max?: number; min?: number; values?: string[]; nullable?: boolean }
const CRITERION_SOURCES = ['MANUAL', 'TASK', 'REQUEST', 'INDICATOR', 'DOCUMENT'];
export const ITEM_KINDS: Record<string, { delegate: string; parent: 'template' | 'gate' | 'task' | 'request'; fields: Record<string, FieldSpec> }> = {
  phases: { delegate: 'templatePhase', parent: 'template', fields: { order: { type: 'int', required: true, min: 0, max: 50 }, name: { type: 'string', required: true, max: 160 }, description: { type: 'text', required: true, max: 3000 },
    plannedWeeks: { type: 'int', min: 0, max: 520 }, plannedJgm4Hours: { type: 'int', min: 0, max: 100000 }, plannedClientHours: { type: 'number', min: 0, max: 100000, nullable: true } } },
  gates: { delegate: 'templateGate', parent: 'template', fields: { phaseId: { type: 'uuid', required: true }, code: { type: 'string', required: true, max: 40 }, title: { type: 'string', required: true, max: 160 }, question: { type: 'text', required: true, max: 1000 }, description: { type: 'text', max: 3000, nullable: true } } },
  criteria: { delegate: 'templateGateCriterion', parent: 'gate', fields: { code: { type: 'string', required: true, max: 40 }, description: { type: 'text', required: true, max: 1000 }, mandatory: { type: 'bool' }, evidenceRequired: { type: 'bool' }, sourceType: { type: 'enum', values: CRITERION_SOURCES }, order: { type: 'int', min: 0, max: 1000 } } },
  tasks: { delegate: 'templateTask', parent: 'template', fields: { phaseId: { type: 'uuid', required: true }, code: { type: 'string', required: true, max: 40 }, title: { type: 'string', required: true, max: 200 }, description: { type: 'text', max: 3000, nullable: true },
    objective: { type: 'text', required: true, max: 3000 }, instructions: { type: 'text', required: true, max: 5000 }, acceptanceCriteria: { type: 'text', required: true, max: 3000 }, responsibilityType: { type: 'enum', values: ['JGM4', 'CLIENT', 'JOINT'] },
    priority: { type: 'enum', values: ['LOW', 'NORMAL', 'HIGH'] }, plannedJgm4Hours: { type: 'number', min: 0, max: 100000 }, plannedClientHours: { type: 'number', min: 0, max: 100000 }, order: { type: 'int', min: 0, max: 10000 } } },
  checklist: { delegate: 'templateChecklistItem', parent: 'task', fields: { label: { type: 'string', required: true, max: 300 }, required: { type: 'bool' }, order: { type: 'int', min: 0, max: 1000 } } },
  requests: { delegate: 'templateRequest', parent: 'template', fields: { phaseId: { type: 'uuid', required: true }, code: { type: 'string', required: true, max: 40 }, title: { type: 'string', required: true, max: 200 }, description: { type: 'text', required: true, max: 3000 },
    instructions: { type: 'text', required: true, max: 5000 }, acceptanceCriteria: { type: 'text', required: true, max: 3000 }, blocking: { type: 'bool' }, mandatory: { type: 'bool' }, relativeDueDays: { type: 'int', min: 0, max: 3650, nullable: true }, order: { type: 'int', min: 0, max: 10000 } } },
  requirements: { delegate: 'templateRequestRequirement', parent: 'request', fields: { label: { type: 'string', required: true, max: 300 }, required: { type: 'bool' }, order: { type: 'int', min: 0, max: 1000 } } },
  dependencies: { delegate: 'templateDependency', parent: 'template', fields: { kind: { type: 'enum', required: true, values: ['TASK_AFTER_TASK', 'TASK_BLOCKED_BY_GATE', 'REQUEST_FOR_TASK'] }, fromCode: { type: 'string', required: true, max: 40 }, toCode: { type: 'string', required: true, max: 40 } } },
};
export const PARENT_FIELD: Record<string, string> = { gate: 'gateId', task: 'taskId', request: 'requestId' };

/** Valida e converte o corpo recebido; campos desconhecidos são rejeitados. `partial` (PATCH) não exige obrigatórios. */
export function parseItem(kind: string, body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const spec = ITEM_KINDS[kind]; if (!spec) throw new BadRequestException('Tipo de item desconhecido.');
  const allowed = new Set([...Object.keys(spec.fields), ...(spec.parent !== 'template' ? [PARENT_FIELD[spec.parent]] : [])]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw new BadRequestException(`Campo não permitido: ${key}.`);
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(spec.fields)) {
    const value = body[name];
    if (value === undefined) { if (field.required && !partial) throw new BadRequestException(`Campo obrigatório: ${name}.`); continue; }
    if (value === null || value === '') { if (field.nullable) { out[name] = null; continue; } if (field.required || field.type === 'string' || field.type === 'text') throw new BadRequestException(`Campo obrigatório: ${name}.`); continue; }
    switch (field.type) {
      case 'string': case 'text': { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`Texto inválido: ${name}.`); if (value.length > (field.max ?? 500)) throw new BadRequestException(`Texto muito longo: ${name}.`); out[name] = value.trim(); break; }
      case 'int': case 'number': { const n = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(n) || (field.type === 'int' && !Number.isInteger(n))) throw new BadRequestException(`Número inválido: ${name}.`); if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) throw new BadRequestException(`Valor fora do intervalo: ${name}.`); out[name] = n; break; }
      case 'bool': { if (typeof value !== 'boolean') throw new BadRequestException(`Valor lógico inválido: ${name}.`); out[name] = value; break; }
      case 'enum': { if (typeof value !== 'string' || !field.values!.includes(value)) throw new BadRequestException(`Valor inválido: ${name}.`); out[name] = value; break; }
      case 'uuid': { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`Identificador inválido: ${name}.`); out[name] = value; break; }
    }
  }
  return out;
}
