# Etapa 2 — Solicitações, início e alinhamento

## Escopo autorizado

O prompt da Etapa 2 validou a Etapa 1 e autorizou o módulo de Solicitações. A mensagem do usuário também confirmou a tela inicial e ambos os formatos do roteiro anterior: tela no JGM4 Projects e documento preenchível. A arquitetura permanece Angular/NestJS/PostgreSQL 5433/Prisma. Não há publicação, alteração do site institucional, valores financeiros, workflow completo de atividades ou aprovação operacional de Gates.

## Migration

`backend/prisma/migrations/20261022000200_requests/migration.sql`:

- Acrescenta enum `RequestStatus` e tabelas `ProjectRequest`, `RequestRequirement` e `AuditLog`.
- Cria índices, unicidade de código por projeto e de requisito por solicitação.
- Usa relações compostas para garantir que solicitação, fase e atividade vinculada pertençam ao mesmo projeto e à mesma fase.
- Preserva o registro de zoneamento existente: o código `F0-002` passa a `C05`, sem recriar a atividade, alterar seu ID ou remover seus dados. Essa adequação fica registrada na auditoria como `CODE_MAPPED`.
- Protege `AuditLog` com triggers que impedem UPDATE, DELETE e TRUNCATE.

Não houve reset, `db push` ou exclusão de dados da Ollem. A migration original permanece inalterada.

## Seed e geração antecipada

O seed mantém empresa, projeto, cinco fases, cinco Gates e duas atividades. Acrescenta:

| Código | Fase | Solicitação | Bloqueante |
| --- | --- | --- | --- |
| SOL-001 | 0 | Indicar patrocinador do projeto | Sim |
| SOL-002 | 0 | Indicar responsáveis internos | Sim |
| SOL-003 | 0 | Consolidar croqui e medidas gerais | Não |
| SOL-004 | 0 | Disponibilizar cadastro de materiais | Não |
| SOL-005 | 0 | Informar fluxos entre sistemas e responsáveis | Não |
| SOL-006 | 0 | Levantamento dimensional do Depósito 01 | Sim, vinculada a C05 |
| SOL-007 | 1 | Apresentar resultados do inventário cíclico piloto | Não |
| SOL-008 | 2 | Apresentar registros de aplicação dos POPs | Não |
| SOL-009 | 3 | Confirmar fontes oficiais e responsáveis pelos indicadores | Não |
| SOL-010 | 4 | Consolidar plano de sustentação e pendências residuais | Não |

Todas são obrigatórias. As seis primeiras começam `AVAILABLE`; as quatro futuras, `BLOCKED`, com informação do Gate anterior pendente. Não foram inventados nomes de responsáveis, datas ou estimativas de horas do cliente.

SOL-006 possui os seis requisitos solicitados: comprimento e largura, corredores, pilares, acessos, estruturas existentes e croqui consolidado.

`ensurePlanCRequests(tx, projectId, createdByUserId?)` centraliza a geração do template. É chamado pelo seed na mesma transação do projeto/fases e está disponível para integrar uma futura criação de projeto. A API de cadastro de projetos continua fora desta etapa; `POST /projects` permanece inexistente, preservando o contrato da Etapa 1. Não é necessário criar as solicitações individualmente. Reexecutar o gerador não reinicia status, requisitos, notas ou histórico.

`createdByUserId`, `completedByUserId` e `AuditLog.userId` ficam nulos quando não existe uma identidade real. `actorType` diferencia `SYSTEM`, `JGM4_LOCAL` e `CLIENT_LOCAL`, determinados pela ação no backend. Não há contas ou senhas fictícias.

## Endpoints

Prefixo da API: `http://127.0.0.1:3000/api`.

| Método | Rota | Função |
| --- | --- | --- |
| GET | `/projects/:projectId/requests?filter=all` | Fila completa |
| GET | `/projects/:projectId/requests/:id` | Detalhe, requisitos, dependência e histórico |
| POST | `/projects/:projectId/requests/:id/request` | Enviar solicitação à Ollem |
| POST | `/projects/:projectId/requests/:id/start` | Iniciar preparação ou retomar ajuste |
| POST | `/projects/:projectId/requests/:id/send` | Enviar resposta à JGM4 |
| POST | `/projects/:projectId/requests/:id/start-review` | Iniciar análise JGM4 |
| POST | `/projects/:projectId/requests/:id/request-adjustment` | Pedir correção com motivo |
| POST | `/projects/:projectId/requests/:id/accept` | Aceitar após análise |
| PATCH | `/projects/:projectId/requests/:id/requirements/:requirementId` | Marcar/desmarcar requisito durante preparação |

Filtros aceitos: `all`, `available`, `client`, `jgm4`, `blocked`, `accepted`.

Payload das transições: `{ "expectedVersion": 0, "note": "Observação opcional" }`. Ambos são opcionais para chamadas manuais; `note` não pode ser vazia no pedido de ajuste. A interface sempre envia a versão atual. Payload do requisito: `{ "completed": true, "expectedVersion": 2 }`. O backend rejeita campos extras, incluindo `status`, `role` e `userId`.

O detalhe retorna `nextAction`, `currentOwnerType`, `currentOwnerUserId`, `nextActionDueDate`, `blockedReason`, `previousGate`, `missingRequirements`, `allowedActions`, `canEditRequirements`, `canSend` e `history`. A interface usa esses dados, e o backend revalida cada ação.

`GET /projects/:id/tasks` mantém seus campos anteriores e acrescenta `blockedByRequests` e `blockingRequests`. Uma solicitação obrigatória e bloqueante vinculada permanece impedindo a atividade enquanto não estiver `ACCEPTED`. O aceite não altera o status próprio da atividade e não aprova nenhum Gate.

## Transições

| Ação | Origem | Destino | Próximo responsável |
| --- | --- | --- | --- |
| request | AVAILABLE | REQUESTED | Cliente |
| start | REQUESTED ou ADJUSTMENT_REQUESTED | CLIENT_PREPARING | Cliente |
| send | CLIENT_PREPARING, com requisitos completos | SENT_TO_JGM4 | JGM4 |
| start-review | SENT_TO_JGM4 | JGM4_REVIEW | JGM4 |
| request-adjustment | JGM4_REVIEW, com motivo | ADJUSTMENT_REQUESTED | Cliente |
| accept | JGM4_REVIEW | ACCEPTED | Sem ação pendente |

`PLANNED`, `BLOCKED`, `CANCELLED` e `ACCEPTED` não possuem transições arbitrárias. Cancelamento e liberação de fase ficam para etapas próprias. As dependências de Gate são reavaliadas pelo backend mesmo se um status inconsistente for inserido diretamente no banco.

UUID, filtros ou payload inválidos: 400. Projeto/solicitação/requisito fora do escopo: 404. Transição inválida, dependência ou versão desatualizada: 409. Ausência de requisito obrigatório no envio: 400, com os requisitos faltantes. Status/requisito e auditoria são gravados na mesma transação; controle de versão impede ações simultâneas duplicadas.

## Como testar manualmente

1. Na raiz de `jgm4-projects/`, execute `npm run setup` e `npm run dev`.
2. Abra `http://127.0.0.1:4200/`: a Central de projetos deve mostrar a Ollem e os três acessos: Plano, Solicitações e Reunião.
3. Entre em Solicitações. Confira dez itens, seis disponíveis e quatro bloqueados. As futuras devem explicar o Gate pendente; não devem permitir envio.
4. Abra SOL-006. Confira atividade C05, seis requisitos e próximo responsável JGM4.
5. Clique **Enviar à Ollem** e **Iniciar preparação**. O envio da resposta permanece desabilitado até concluir os seis requisitos.
6. Complete os requisitos, registre a resposta e clique **Enviar resposta à JGM4**. Inicie a análise JGM4.
7. Informe um motivo e solicite ajuste. Retome a preparação pelo cliente, corrija a resposta, envie e inicie nova análise.
8. Aceite. A solicitação permanece na fila Aceitas e no histórico. A dependência de C05 deixa de bloquear por SOL-006; o status da atividade permanece separado.
9. Consulte o histórico, incluindo respostas e motivo de ajuste. Recarregue a página para confirmar persistência no PostgreSQL.
10. Abra **Reunião de alinhamento**, preencha participantes e respostas. Recarregue: o rascunho deve ser recuperado deste navegador, por projeto.
11. Clique **Baixar documento preenchível**. Abra o HTML baixado no navegador, edite respostas e clique **Salvar cópia preenchida**. A cópia preserva o preenchimento sem depender do aplicativo. **Imprimir / PDF** permite gerar a versão para distribuição.

As ações manuais dos itens 4–9 alteram os dados locais do projeto de forma auditada. Não existe reset automático pelo seed. Para ver o ciclo sem alterar a Ollem, use os testes automatizados isolados.

## Roteiro e documento

O roteiro reproduz os temas e perguntas do material fornecido: 17 partes e 12 informações de síntese. As respostas ficam em `localStorage`, na chave `jgm4-alignment-v1:<projectId>`, sem envio ao backend. O estado indica sucesso ou falha da gravação local. O documento HTML pode ser baixado com respostas ou aberto em branco em `docs/alinhamento-plano-c-preenchivel.html`; não contém valores financeiros. Campos do cliente são escapados no HTML para impedir execução como código. A tela e o documento servem para registrar entendimento; nenhum deles aprova Gates ou modifica o workflow.

## Limites

As transições são controladas por estado no backend. Identidade, RBAC e visibilidade restrita do cliente continuam pendentes conforme o prompt. A aplicação é de operação local; a visão atual é JGM4 e inclui toda a fila futura. Não se deve interpretar o rótulo de organização como autenticação de quem clicou.

Solicitações não implementam upload de anexos nesta etapa. Respostas e observações textuais são guardadas na auditoria de transição. Acompanhamento integral das atividades, regras completas de Gate e demais módulos dependem de validação e escopo posteriores.

## Referências técnicas

- [Validação de DTOs no NestJS](https://docs.nestjs.com/techniques/validation).
- [Formulários Angular](https://angular.dev/guide/forms/template-driven-forms).
