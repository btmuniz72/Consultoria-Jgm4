# Validação — Etapa 5: Central de Aprovações, Alçadas e Próxima Ação

> **Atualização (Etapa 5.1):** o perfil simulado por `x-actor-role` e o seletor de perfil descritos abaixo foram substituídos por autenticação real e vínculo usuário-projeto. Veja [validacao-etapa-5-1.md](validacao-etapa-5-1.md). O restante (tipos, matriz de alçadas, fluxos) continua válido.

## Resultado

| Verificação | Resultado |
|---|---|
| Migrations (`npm run db:migrate`, 5 migrations) | Aplicadas; `db:status`: schema atualizado |
| Seed (`npm run db:seed`) | OK e idempotente (2ª execução não duplica) |
| Testes backend (`npm test`) | **74/74** — 52 anteriores (Etapas 1–4) + 22 novos da Etapa 5 |
| Build backend e frontend (`npm run build`) | OK |
| Navegador Etapa 5, desktop 1440 px e mobile 390 px (`BROWSER_CHANNEL=msedge npm run test:browser:stage5`) | OK; sem rolagem horizontal no mobile |

Observações honestas:
- O Chromium embutido do Playwright falha nesta máquina (erro de ICU); os checks de navegador rodaram com Edge (`BROWSER_CHANNEL=msedge`). O script da Etapa 4 não lê essa variável e continua falhando por esse motivo, com ou sem as alterações da Etapa 5 (verificado).
- Mudanças em testes antigos (nenhuma asserção alterada): os specs das Etapas 2–4 passaram a aplicar a migration `20261024000100_approvals` nos schemas isolados; o health check agora responde `stage: 5` (asserção do spec da Etapa 1 atualizada).
- Teste de mutação: afrouxar a alçada de reabertura faz o teste 15 falhar (o teste realmente protege a regra).

## Tipos de aprovação (`ApprovalType`)

| Tipo | Criada quando | Responsável | Efeito da aprovação |
|---|---|---|---|
| `REQUEST_REVIEW` | Solicitação → `SENT_TO_JGM4` | JGM4 | Solicitação aceita (`ACCEPTED`) |
| `TASK_VALIDATION` | Atividade → `WAITING_JGM4_VALIDATION` | JGM4 | Atividade `VALIDATED` |
| `GATE_TECHNICAL_OPINION` | Gate fica `AVAILABLE` (e ao retomar análise) | JGM4 | Parecer favorável → `TECHNICALLY_APPROVED` |
| `GATE_CLIENT_DECISION` | Gate → `TECHNICALLY_APPROVED` | Patrocinador Ollem | Gate `APPROVED`, fase seguinte liberada |
| `DUE_DATE_CHANGE` | Pedido via API/tela da atividade | JGM4_ADMIN | Atualiza `plannedEndDate` |
| `RESPONSIBLE_CHANGE` | Pedido via API | JGM4_ADMIN | Troca responsável cliente/JGM4 |
| `TASK_REOPEN` | Pedido via API/tela da atividade | JGM4_ADMIN | `COMPLETED` → `IN_PROGRESS` |
| `REQUEST_CANCEL` | Pedido via API | JGM4_ADMIN | Solicitação `CANCELLED` |
| `OTHER` | Reservado | JGM4_ADMIN | Apenas registra a decisão |

Status: `PENDING`, `IN_REVIEW`, `APPROVED`, `ADJUSTMENT_REQUESTED`, `REJECTED`, `CANCELLED`. Prioridade: `LOW`, `NORMAL`, `HIGH`, `CRITICAL`.

**Idempotência:** índice único parcial no banco (uma aprovação aberta por entidade + tipo) e checagem na função `ensureApproval`. **Imutabilidade:** triggers impedem DELETE/TRUNCATE em `Approval` e a reescrita de uma aprovação já decidida; o `AuditLog` já era imutável.

## Matriz de alçadas (`backend/src/approvals/authority.ts`)

Lista de regras `permissão → roles`, pronta para expansão (por projeto/usuário vinculado).

| Ação | ADMIN | CONSULTANT | SPONSOR | MANAGER | USER |
|---|:-:|:-:|:-:|:-:|:-:|
| Validar solicitações / atividades | ✔ | ✔ | | | |
| Parecer técnico de Gate | ✔ | ✔* | | | |
| Solicitar ajuste / rejeitar (nos tipos que decide) | ✔ | ✔ | | | |
| Aprovar prazo, trocar responsável, reabrir, cancelar solicitação, resolver conflitos | ✔ | | | | |
| Decisão do Gate (Ollem) / mudanças críticas do cliente | | | ✔ | | |
| Executar atividades, responder solicitações | | | ✔ | ✔ | |
| Pedir prazo / responsável / reabertura / cancelamento | ✔ | ✔ | ✔ | ✔ | |
| Estrutura de fase, reabrir item encerrado, Gate fechado, regras globais (reservado) | ✔ | | | | |

\* Consultor "quando vinculado ao projeto": ainda não existe vínculo usuário↔projeto; hoje vale para qualquer projeto.

**Perfil do ator:** não há login nesta fase. O cabeçalho HTTP `x-actor-role` (seletor "Perfil simulado" no topo da aplicação) escolhe o perfil; sem ele vale `JGM4_LOCAL_ACTOR` (`JGM4` → `JGM4_ADMIN`, `CLIENT` → `CLIENT_SPONSOR`), preservando o comportamento das Etapas 1–4. Isto é uma simulação local, **não** é segurança: qualquer cliente HTTP pode enviar o cabeçalho. Autenticação real continua pendente.

## Endpoints novos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/approvals?category=&due=today\|overdue&priority=high&projectId=&status=open\|all&scope=mine\|all` | Lista (padrão: o que a alçada do perfil pode decidir) |
| GET | `/api/approvals/summary[?projectId=]` | Contagens para cards e badge |
| GET | `/api/approvals/authority` | Perfil efetivo, permissões e regras |
| GET | `/api/approvals/:id` | Detalhe com contexto, histórico e decisões anteriores |
| POST | `/api/approvals/:id/approve` · `/request-adjustment` · `/reject` | Decisão (`comment`, `instructions`, `suggestedDueDate`, `technicalOpinion`) |
| GET | `/api/projects/:id/approvals/pending` | Bloco "Aguardando decisão" |
| POST | `/api/tasks/:id/due-date-change` | `requestedDate`, `justification`, `expectedImpact` |
| POST | `/api/tasks/:id/responsible-change` | `field` (CLIENT/JGM4), `newUserId`, `justification` |
| POST | `/api/tasks/:id/reopen` | `reason` |
| POST | `/api/projects/:id/requests/:rid/cancellation` | `reason` |

## Fluxo

1. O workflow original (envio de solicitação, envio de evidências, Gate disponível, parecer favorável) cria a aprovação **dentro da mesma transação**.
2. A Central mostra apenas o que o perfil pode decidir ("Aguardando minha ação"), com cliente/projeto, tipo, código, status, responsável atual, próxima ação, prazo, envio e impacto.
3. A decisão executa a transição real do workflow (ex.: aceitar solicitação, validar atividade, emitir parecer), que grava no próprio histórico e atualiza a aprovação; `AuditLog` registra `APPROVAL_*` com perfil e comentário.
4. **Ajuste** exige motivo + instrução (prazo sugerido opcional, registrado no texto). **Rejeitar** exige motivo; em solicitação/atividade o efeito no workflow é devolver para refazer, registrado como `REJECTED`. Para o patrocinador, "solicitar ajuste" = **manter em espera**: o Gate segue aguardando e a aprovação permanece aberta (auditado).
5. Parecer técnico (JGM4) e decisão (patrocinador) são aprovações distintas; JGM4 não decide o Gate e o cliente não emite parecer (403 também nas rotas diretas `/api/gates/...`).
6. **Prazo:** atividade ativa não aceita `plannedEndDate` direto em `PATCH /tasks/:id/plan` (409); só via `DUE_DATE_CHANGE`. Aprovado: grava novo prazo e audita anterior/novo/solicitante/aprovador. Rejeitado: prazo preservado.
7. **Reabertura:** só `JGM4_ADMIN`; recusada se o Gate da fase já estiver `APPROVED/CLOSED/REJECTED`; se o Gate estava em análise, volta a `BLOCKED` e suas aprovações abertas são canceladas. Sucessoras já liberadas não são revertidas.
8. **Cancelamento** de solicitação obrigatória e bloqueante é recusado (deixaria Gate/atividades travados).

## Telas

- **Cabeçalho:** `🔔 Aprovações N` (badge PENDING+IN_REVIEW do perfil, atualiza a cada navegação e 30 s) e seletor de perfil simulado.
- **`/approvals` e `/approvals/:id`:** cards (Solicitações, Atividades, Gates, Alterações + total), filtros (Todos, categorias, Hoje, Atrasados, Alta prioridade, Projeto, Histórico), tabela Tipo · Código · Projeto · Descrição · Responsável · Recebido em · Prazo · Prioridade · Ação (cartões no mobile) e painel de detalhe com botões Aprovar / Solicitar ajuste / Rejeitar.
- **Dashboard do projeto:** bloco "Aguardando decisão" com atalhos para a Central.
- **Atividade:** botões "Solicitar alteração de prazo" e "Solicitar reabertura". Pedido de troca de responsável existe só na API (não há cadastro/listagem de usuários ainda).

## Testes novos (`backend/test/approvals.spec.ts`, 22)

Cobrem os 18 itens obrigatórios: criação por solicitação (1), atividade (2), Gate disponível (3) e parecer favorável → decisão Ollem (4); sem duplicidade (5, inclusive índice do banco); sem alçada (6); JGM4 aprova (7) e pede ajuste (8); cliente não valida (9); patrocinador decide (10) e gestor/JGM4 não (11); prazo exige aprovação (12), aprovado atualiza (13), rejeitado preserva (14); reabertura exige admin (15); AuditLog e imutabilidade (16); contagem de pendências por perfil (17); suítes anteriores verdes (18). Extras: rejeição, troca de responsável, reabertura com Gate fechado, cancelamento, filtros, bloco do projeto, matriz.

## Cenário demonstrável (seed)

Para não alterar o projeto Ollem validado (o teste de seed exige que permaneça idêntico), a demonstração está na empresa **"Ollem do Brasil — Demonstração"**:

- *Simulação — Solicitações e atividades:* **SOL-006** enviada (aguardando JGM4), **C05** aguardando validação, **C04** com pedido de prazo (+14 dias) pendente.
- *Simulação — Parecer de Gate:* **GATE-0** disponível aguardando parecer técnico. Ao emitir parecer favorável, surge a decisão do patrocinador (perfil "Cliente · Patrocinador").

Para repetir a demo, recrie o banco local ou use um novo schema; o seed não recria projetos existentes.

## Fora do escopo (conforme pedido)

E-mail, WhatsApp, push externo, financeiro, preços, exportação final, deploy. Etapa 6 não iniciada.
