# Etapa 3 — workflow das atividades e horas

## Escopo

A aplicação mantém Angular, NestJS, PostgreSQL 5433 e Prisma das etapas validadas. Esta etapa acrescenta estado controlado de atividade, dependências, planejamento de esforço JGM4 e Ollem, checklist, evidências, TimeEntry, totais planejados e realizados e auditoria imutável. Não aprova Gates; Gates anteriores são verificados como dependências.

## Migration e seed

`20261023000100_task_workflow` acrescenta campos de planejamento e execução a Task, os status `CANCELLED`, `TaskRequirement`, `TaskEvidence` e `TimeEntry`, com relações limitadas a projeto, fase e atividade. Horas são `DECIMAL(8,2)`. A migration mapeia o ID de F0-001 para C00 e preenche as estimativas existentes de C00 e C05 apenas quando ainda estão vazias.

O seed preserva IDs, estados e registros já existentes, cria o restante do Plano C e registra a distribuição inicial em auditoria. Cada fase soma o total JGM4 definido no projeto:

| Fase | Atividades JGM4 (h) | Total |
| --- | --- | ---: |
| 0 | C00 6 · C01 8 · C02 4 · C03 6 · C04 5 · C05 4 · C06 1 · G0 2 | 36 |
| 1 | C10 7 · C11 8 · C12 6 · C13 8 · C14 7 · G1 3 | 39 |
| 2 | C20 9 · C21 8 · C22 7 · C23 7 · C24 8 · C25 5 · G2 3 | 47 |
| 3 | C30 7 · C31 7 · C32 8 · C33 8 · C34 6 · G3 3 | 39 |
| 4 | C40 8 · C41 7 · C42 6 · C43 6 · C44 7 · G4 3 | 37 |

Estimativas Ollem são esforço em horas, sem preço. Fase 0 mantém C01 6 h, C04 12 h e C05 8 h; os demais números iniciais do seed constam em `backend/prisma/seed.ts` e podem ser revisados sem alterar lançamentos históricos. SOL-006 continua vinculada a C05 e bloqueia a liberação até ser aceita.

## Workflow

```text
BLOCKED → RELEASED → IN_PROGRESS → WAITING_EVIDENCE
                                  → WAITING_JGM4_VALIDATION → VALIDATED → COMPLETED
                                  ↘ ADJUSTMENT_REQUESTED → IN_PROGRESS
```

O backend libera atividades bloqueadas somente quando solicitações obrigatórias e bloqueantes foram aceitas, predecessora concluída e Gate anterior aprovado. A última condição só se aplica quando a atividade aponta para um Gate anterior. Após o aceite de SOL-006, C05 passa automaticamente de BLOCKED para RELEASED, com AuditLog na mesma transação. Uma alteração genérica de status não existe.

`send-validation` verifica critérios obrigatórios e leva a atividade para `WAITING_EVIDENCE`. A Ollem registra uma evidência e usa `submit-evidence` para encaminhar à JGM4. A JGM4 valida ou informa motivo e orientação para ajuste. Após a validação, a JGM4 conclui a atividade.

## Horas

`TimeEntry` registra data, decimal de horas, descrição e organização. O backend escolhe `JGM4` ou `CLIENT` pelo perfil local configurado no servidor; o navegador não envia a organização. Realizado e saldo são calculados pela soma das entradas. Ao atingir 80% do planejado a API retorna `ATENÇÃO — 80% das horas planejadas consumidas.`. Acima do planejado retorna `HORAS PLANEJADAS EXCEDIDAS.` sem impedir outro lançamento.

A alteração de horas JGM4 planejadas em uma atividade precisa manter a soma da fase igual ao total de horas planejadas dessa fase. A alteração de estimativa Ollem não muda entradas já registradas. Datas e planejamento alterados por JGM4 geram AuditLog.

## Endpoints

Prefixo `http://127.0.0.1:3000/api`.

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/projects/:projectId/tasks` | Atividades com dependências, totais e próxima ação |
| GET | `/projects/:projectId/tasks/:taskId` | Detalhe, checklist, evidências, apontamentos e histórico |
| POST | `/tasks/:id/start` | Liberada → em andamento |
| POST | `/tasks/:id/send-validation` | Em andamento → aguardando evidências |
| POST | `/tasks/:id/evidence` | Registra descrição e referência da evidência |
| POST | `/tasks/:id/submit-evidence` | Evidências → aguardando JGM4 |
| POST | `/tasks/:id/validate` | JGM4: aguardando validação → validada |
| POST | `/tasks/:id/request-adjustment` | JGM4: solicita correção com motivo e orientação |
| POST | `/tasks/:id/resume` | Ollem: ajuste solicitado → em andamento |
| POST | `/tasks/:id/complete` | JGM4: validada → concluída |
| PATCH | `/tasks/:id/requirements/:requirementId` | Atualiza critério obrigatório durante execução |
| POST | `/tasks/:id/time-entries` | Registra esforço do perfil local |
| PATCH | `/tasks/:id/plan` | Atualiza planejamento permitido e audita diferenças |
| GET | `/projects/:projectId/activity-summary/phases` | Esforço e contagem por fase |
| GET | `/projects/:projectId/activity-summary` | Esforço total do projeto |

As ações concorrentes usam versão da atividade; a versão antiga retorna 409. Checklist, transição, evidência, plano e horas geram log. Logs são protegidos contra UPDATE, DELETE e TRUNCATE por triggers PostgreSQL.

## Perfil local e limites

Configure `JGM4_LOCAL_ACTOR=JGM4` ou `JGM4_LOCAL_ACTOR=CLIENT` no `.env` e reinicie a API. Isso permite demonstrar os dois perfis na instância local e deixa a organização da hora sob controle do backend. O app ainda não tem login nem identidade de usuário; `userId` permanece nulo em vez de inventar pessoas. Esta configuração local não deve ser usada como mecanismo de autenticação em serviço publicado.

O registro de evidência nesta etapa guarda descrição e link/referência; upload de arquivo, notificações, exportações avançadas, Gates aprovados, finanças e deploy ficam fora do escopo.
